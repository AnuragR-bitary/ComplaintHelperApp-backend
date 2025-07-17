const axios = require('axios');

async function paraphraseWithOpenRouter(originalText) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set in environment variables');
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'moonshotai/kimi-k2:free',
      messages: [
        {
          role: 'user',
          content: `Paraphrase this: ${originalText}`,
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );
  return response.data.choices[0].message.content;
}

module.exports = { paraphraseWithOpenRouter };
