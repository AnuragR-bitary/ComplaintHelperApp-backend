const axios = require('axios');
const { sleep, updateRateLimitFromHeaders } = require('./utils');

// Configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds

// Track rate limits
let rateLimit = {
  remaining: 60, // Default rate limit
  resetTime: Date.now() + RATE_LIMIT_WINDOW
};

/**
 * Makes a request to OpenRouter API
 * @param {string} originalText - The text to paraphrase
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<Object>} - The API response
 */
async function makeOpenRouterRequest(originalText, apiKey) {
  return axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'tngtech/deepseek-r1t2-chimera:free',
      messages: [
        {
          role: 'user',
          content: `Paraphrase this professionally and formally: ${originalText}`,
        },
      ],
      temperature: 0.7,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'Complaint Helper App',
      },
      timeout: 30000, // 30 seconds timeout
    }
  );
}

/**
 * Handles rate limiting and retries for the API request
 * @param {string} originalText - The text to paraphrase
 * @param {number} attempt - Current retry attempt
 * @param {number} retryDelay - Current retry delay in ms
 * @returns {Promise<string>} - The paraphrased text
 */
async function handleApiRequest(originalText, attempt = 1, retryDelay = INITIAL_RETRY_DELAY) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set in environment variables');
  }

  try {
    // Check rate limits
    const now = Date.now();
    if (now < rateLimit.resetTime && rateLimit.remaining <= 0) {
      const waitTime = rateLimit.resetTime - now;
      console.log(`Rate limit reached. Waiting ${Math.ceil(waitTime/1000)} seconds before retrying...`);
      await sleep(waitTime);
    }

    const response = await makeOpenRouterRequest(originalText, apiKey);
    
    // Update rate limit from headers
    rateLimit = updateRateLimitFromHeaders(rateLimit, response.headers);
    
    return response.data.choices[0].message.content;
  } catch (error) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(`Failed after ${MAX_RETRIES} attempts: ${error.message}`);
    }

    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] 
        ? parseInt(error.response.headers['retry-after']) * 1000 
        : retryDelay * 2;
      
      console.warn(`Rate limited. Retrying in ${retryAfter/1000} seconds...`);
      await sleep(retryAfter);
      return handleApiRequest(originalText, attempt + 1, retryDelay * 2);
    }

    // Update rate limit from error headers if available
    if (error.response?.headers) {
      rateLimit = updateRateLimitFromHeaders(rateLimit, error.response.headers);
    }

    // For other errors, use exponential backoff
    console.error(`Attempt ${attempt} failed: ${error.message}`);
    await sleep(retryDelay);
    return handleApiRequest(originalText, attempt + 1, retryDelay * 2);
  }
}

/**
 * Main function to paraphrase text using OpenRouter API
 * @param {string} originalText - The text to paraphrase
 * @returns {Promise<string>} - The paraphrased text
 */
async function paraphraseWithOpenRouter(originalText) {
  if (!originalText || typeof originalText !== 'string') {
    throw new Error('Invalid input: originalText must be a non-empty string');
  }
  
  return handleApiRequest(originalText);
}

module.exports = { paraphraseWithOpenRouter };
