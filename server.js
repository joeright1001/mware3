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
 * 5. Database health monitoring
 * 
 * Dependencies:
 * - dotenv for environment variables
 * - express for web server
 * - cors for Cross-Origin Resource Sharing
 * - pg for PostgreSQL connection
 * 
 * IMPORTANT CONFIGURATIONS:
 * - PORT in .env file (defaults to 3000)
 * - Ensure all required environment variables are set:
 *   Development: in .env file
 *   Production: in Railway dashboard
 *     - DATABASE_URL (auto-set by Railway)
 *     - JWT_SECRET
 *     - NODE_ENV=production
 *     - PORT (optional)
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");

// Import configurations
const corsOptions = require('./src/config/cors');
const pool = require('./src/config/database');

// Import routes
const orderRoutes = require('./src/routes/public/orders');

// Debug: Log environment variables
console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Not Set',
    JWT_SECRET: process.env.JWT_SECRET ? 'Set' : 'Not Set'
});

// Debug: Log configurations
console.log('Loaded configurations:', {
    corsOptions,
    orderRoutes: typeof orderRoutes
});

const app = express();

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

console.log('Middleware initialized');

// Routes
app.use("/", orderRoutes);  // Base URL for order routes

// Enhanced health check endpoint with database status
app.get('/health', async (req, res) => {
    try {
        // Test database connection
        await pool.query('SELECT NOW()');
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            database: 'connected',
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        console.error('Health check database error:', error);
        res.status(500).json({ 
            status: 'error', 
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            environment: process.env.NODE_ENV || 'development'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).json({ error: "Server error" });
});

// ⚠️ CONFIGURE: Server port
const PORT = process.env.PORT || 3000;

// CRITICAL: Create server this way to handle shutdown
const server = app.listen(PORT, async () => {
    try {
        // Test database connection on startup
        await pool.query('SELECT NOW()');
        console.log('📦 Database connection successful');
        console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    } catch (error) {
        console.error('Database connection error:', error);
        // Continue running even if database connection fails
        console.log(`🚀 Server running on port ${PORT} (WARNING: Database connection failed)`);
    }
});

// Graceful Shutdown Handler
async function gracefulShutdown() {
    console.log('Received kill signal, shutting down gracefully');
    
    try {
        // Close database pool
        await pool.end();
        console.log('Database pool has ended');
        
        server.close(() => {
            console.log('Closed out remaining connections');
            process.exit(0);
        });
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
    
    // Force close after 10 seconds
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);