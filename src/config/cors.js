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
    // ⚠️ CONFIGURE: Change this URL for different environments
    origin: "https://gold-buyers-christchurch.webflow.io",
    methods: "GET,POST,OPTIONS",
    allowedHeaders: "Content-Type",

    
};
module.exports = corsOptions;

