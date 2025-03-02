/**
 * Main Application Entry Point
 * --------------------------
 * Purpose: Initializes and configures the Express application
 * Role: Sets up middleware, routes, and starts the server
 * 
 * Key Components:
 * 1. Environment variables loading
 * 2. CORS configuration
 * 3. Route registration
 * 4. Server initialization
 * 5. Admin dashboard
 * 
 * Dependencies:
 * - dotenv for environment variables
 * - express for web server
 * - cors for Cross-Origin Resource Sharing
 * - ejs for templating
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require('path');
const rateLimit = require('express-rate-limit');

// Import configurations
const corsOptions = require('./src/config/cors');

// Import routes
const orderRoutes = require('./src/routes/public/orders');
const paymentRoutes = require('./src/routes/public/payments');
const adminRoutes = require('./src/routes/admin/dashboard');

// Import payment status queue
const { paymentStatusQueue } = require('./src/services/payments/paystatus/paymentStatusQueue');

// Debug: Log environment variables
console.log('Environment:', {
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Not Set',
    JWT_SECRET: process.env.JWT_SECRET ? 'Set' : 'Not Set',
    POLI_AUTH_CODE: process.env.POLI_AUTH_CODE ? 'Set' : 'Not Set',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? 'Set' : 'Not Set'
});

const app = express();

// Trust proxy setting for rate limiting (important for Railway)
app.set('trust proxy', 1);

// Set up templating engine for admin dashboard
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

console.log('Middleware initialized');

// Admin route rate limiting
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Routes
app.use("/", orderRoutes);          // Base URL for order routes
app.use("/api", paymentRoutes);     // Payment status endpoint
app.use('/admin', adminLimiter, adminRoutes); // Admin dashboard routes

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).json({ error: "Server error" });
});

// ⚠️ CONFIGURE: Server port
const PORT = process.env.PORT || 3000;

// CRITICAL: Create server this way to handle shutdown
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`💰 Payment status checking service initialized`);
});

// Graceful Shutdown Handler
function gracefulShutdown() {
    console.log('Received kill signal, shutting down gracefully');
    
    // First close the server
    server.close(async () => {
        console.log('Closed out remaining connections');
        
        // Then close the payment status queue
        try {
            await paymentStatusQueue.close();
            console.log('Payment status queue closed');
        } catch (err) {
            console.error('Error closing payment status queue:', err);
        }
        
        process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

/**
// Add this to your server.js file temporarily for testing
app.get('/test-db', async (req, res) => {
    try {
      const pool = require('./src/config/database');
      const result = await pool.query('SELECT COUNT(*) FROM payments');
      res.json({ 
        success: true, 
        count: result.rows[0].count,
        message: 'Database connection successful'
      });
    } catch (error) {
      console.error('Database test error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        stack: error.stack
      });
    }
  });

*/


// const path = require('path');

// Set up templating engine for admin dashboard
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Add basic health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});