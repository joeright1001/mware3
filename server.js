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
 * 
 * Dependencies:
 * - dotenv for environment variables
 * - express for web server
 * - cors for Cross-Origin Resource Sharing
 * 
 * IMPORTANT CONFIGURATIONS:
 * - PORT in .env file (defaults to 3000)
 * - Ensure all required environment variables are set in .env:
 *   - DATABASE_URL
 *   - JWT_SECRET
 *   - PORT (optional)
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");

// Import configurations
const corsOptions = require('./src/config/cors');

// Import routes
const orderRoutes = require('./src/routes/public/orders');

const app = express();

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use("/", orderRoutes);  // Base URL for order routes

// ⚠️ CONFIGURE: Server port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));