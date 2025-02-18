/**
 * CORS Configuration
 * -----------------
 * Purpose: Defines Cross-Origin Resource Sharing (CORS) settings
 * Role: Controls which domains can access your API
 * 
 * IMPORTANT CONFIGURATION:
 * - origin: Change this URL when deploying to different environments
 * - methods: HTTP methods allowed
 * - allowedHeaders: Headers clients can send
 */

const corsOptions = {
    origin: process.env.CORS_ORIGIN,
    methods: "GET,POST,OPTIONS",
    allowedHeaders: "Content-Type",
    credentials: true
};

module.exports = corsOptions;