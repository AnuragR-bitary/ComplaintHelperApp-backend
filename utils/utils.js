/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Updates the rate limit information from response headers
 * @param {Object} rateLimit - Current rate limit state
 * @param {Object} headers - Response headers
 * @returns {Object} Updated rate limit state
 */
function updateRateLimitFromHeaders(rateLimit, headers) {
  if (!headers) return rateLimit;
  
  const remaining = parseInt(headers['x-ratelimit-remaining']);
  const resetTime = parseInt(headers['x-ratelimit-reset']);
  
  if (!isNaN(remaining) && !isNaN(resetTime)) {
    return {
      remaining,
      resetTime: resetTime * 1000, // Convert to milliseconds
    };
  }
  return rateLimit;
}

module.exports = { sleep, updateRateLimitFromHeaders };
