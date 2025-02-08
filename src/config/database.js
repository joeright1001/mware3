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
 * IMPORTANT CONFIGURATION:
 * The DATABASE_URL should be set in your .env file with format:
 * postgresql://username:password@host:port/database
 */

const { Pool } = require("pg");

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL 
});

module.exports = pool;