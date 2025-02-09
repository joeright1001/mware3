/**
 * Database Configuration
 * ---------------------
 * Purpose: Centralizes database connection configuration
 * Role: Provides a single connection pool instance used throughout the application
 * 
 * Dependencies:
 * - pg (PostgreSQL client)
 * - DATABASE_URL environment variable
 * 
 * Environment Configurations:
 * Development:
 * - Uses local .env file
 * - DATABASE_URL should point to local PostgreSQL
 * - No SSL required
 * 
 * Production (Railway):
 * - Uses Railway's environment variables
 * - DATABASE_URL automatically provided by Railway
 * - Requires SSL configuration
 */

const { Pool } = require("pg");

const getDbConfig = () => {
    // Base config used in both environments
    const config = {
        connectionString: process.env.DATABASE_URL,
    };

    // Add SSL for production (Railway) only
    if (process.env.NODE_ENV === 'production') {
        config.ssl = {
            rejectUnauthorized: false
        };
    }

    return config;
};

const pool = new Pool(getDbConfig());

// Log connection mode
console.log(`Database config initialized for ${process.env.NODE_ENV || 'development'} environment`);

module.exports = pool;