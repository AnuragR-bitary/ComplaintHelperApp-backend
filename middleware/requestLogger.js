const fs = require('fs');
const path = require('path');
const morgan = require('morgan');

// Create logs directory if not exists
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Create a write stream (in append mode)
const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });

// Custom token to log request body (optional & careful with sensitive data)
morgan.token('body', (req) => JSON.stringify(req.body));

// Define the format
const logger = morgan(':method :url :status :res[content-length] - :response-time ms :body', {
  stream: accessLogStream,
});

module.exports = logger;
