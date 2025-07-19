// Load environment variables first
require("dotenv").config();

// Log environment info
console.log('=== Starting Server ===');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('Keycloak URL:', process.env.KEYCLOAK_ISSUER || 'Not set');

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { decodeAndVerifyJWT } = require("../utils/jwt");
const complaintRouter = require("../complaint-service/complaint.controller");
const paymentRouter = require("../payment-service/payment.controller");
const userRouter = require("../user-service/user.controller");
const serviceRouter = require("../service-service/service.controller");
const requestLogger = require("../middleware/requestLogger");

const app = express();
// Configure CORS with credentials support
const corsOptions = {
  origin: 'http://localhost:8100', // Your frontend URL
  credentials: true, // Allow credentials (cookies, authorization headers)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

// Enable CORS with the above options
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));
app.use(express.json());

//for maintaining logs 
app.use(requestLogger);

// Connect to MongoDB with enhanced logging
console.log('Attempting to connect to MongoDB...');
console.log('MongoDB URI:', process.env.MONGODB_URI);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database Name: ${conn.connection.name}`);
    
    // Log all collections in the database
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
    
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

connectDB();

app.post("/api/test-login", (req, res) => {
  const testUser = {
    id: "507f1f77bcf86cd799439011",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    roles: ["user"],
  };
  // In a real app, generate a proper JWT token here
  res.json({
    token: "507f1f77bcf86cd799439011",
    user: testUser,
  });
  
});
// JWT Middleware
app.use(async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (authHeader === 'Bearer 507f1f77bcf86cd799439011') {
    req.user = {
      id: '507f1f77bcf86cd799439011',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      roles: ['user']
    };
    return next();
  }
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid Authorization header" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = await decodeAndVerifyJWT(token);
    console.log('JWT Payload:', JSON.stringify(payload, null, 2));
    
    // Ensure we have the required fields from the JWT payload
    if (!payload.sub) {
      console.error('JWT payload missing required field: sub');
      return res.status(401).json({ error: 'Invalid token: missing subject' });
    }
    
    if (!payload.email) {
      console.error('JWT payload missing required field: email');
      return res.status(401).json({ error: 'Invalid token: missing email' });
    }
    
    // Create user object with all necessary fields
    req.user = {
      id: payload.sub,  // Use sub as the Keycloak user ID
      keycloakId: payload.sub,  // Also store as keycloakId for compatibility
      email: payload.email,
      firstName: payload.given_name || payload.firstName || '',
      lastName: payload.family_name || payload.lastName || '',
      roles: payload.realm_access?.roles || [],
      // Include any other fields you might need
      ...payload
    };
    
    console.log('Formatted user object:', JSON.stringify(req.user, null, 2));
    next();
  } catch (err) {
    return res.status(401).json({ 
      error: 'Invalid token', 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
});

// User sync middleware (after JWT verification)
const syncUserFromJWT = require('../middleware/userSync');
app.use(syncUserFromJWT);

// Route requests to microservices
app.use("/api/complaints", complaintRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/users", userRouter);
app.use("/api/services", serviceRouter);


app.get("/api/ping", (req, res) => res.json({ status: "ok", user: req.user }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
