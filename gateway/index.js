require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { decodeAndVerifyJWT } = require('../utils/jwt');
const complaintRouter = require('../complaint-service/complaint.controller');
const paymentRouter = require('../payment-service/payment.controller');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// JWT Middleware
app.use(async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = await decodeAndVerifyJWT(token);
    req.user = { id: payload.sub, email: payload.email, roles: payload.realm_access?.roles || [] };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', details: err.message });
  }
});

// Route requests to microservices
app.use('/api/complaints', complaintRouter);
app.use('/api/payments', paymentRouter);

app.get('/api/ping', (req, res) => res.json({ status: 'ok', user: req.user }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
