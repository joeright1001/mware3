/**
 * POLi Payment Status Provider
 * ----------------------------
 * Purpose: Handles POLi-specific payment status checking
 * 
 * Functions:
 * - Connect to POLi API with proper authentication
 * - Query payment status using the stored token/payid
 * - Parse and normalize API responses
 * - Handle POLi-specific error conditions
 */

const axios = require('axios');

class PoliPaymentStatus {
    constructor() {
        // Use the environment variable for the base URL
        this.baseUrl = process.env.POLI_API_STATUS_URL || 'https://publicapi.uat3.paywithpoli.com/api/POLiLink/Status';
        this.authCode = process.env.POLI_AUTH_CODE;
    }

    /**
     * Check the status of a POLi payment
     * @param {string} payid - The payment token/ID to check
     * @returns {Object} Normalized status information
     */
    async checkStatus(payid) {
        try {
            console.log(`Checking POLi payment status for: ${payid}`);
            
            // Log URL being used (for debugging)
            const statusUrl = this.baseUrl.endsWith('/') ? `${this.baseUrl}${payid}` : `${this.baseUrl}/${payid}`;
            console.log(`POLi status check URL: ${statusUrl}`);
            console.log(`POLi auth code available: ${this.authCode ? 'Yes' : 'No'}`);
            
            // Make API request to POLi
            const response = await axios.get(statusUrl, {
                headers: {
                    'Authorization': `Basic ${this.authCode}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`POLi status response for ${payid}:`, response.data);
            
            // Normalize the response
            // POLi returns the status as a quoted string like "Activated"
            const status = typeof response.data === 'string' 
                ? response.data.replace(/^"|"$/g, '') 
                : response.data;
            
            return {
                status: this.normalizeStatus(status),
                originalStatus: status,
                message: `POLi status check successful: ${status}`
            };
        } catch (error) {
            console.error(`POLi status check error for ${payid}:`, {
                message: error.message,
                response: error.response?.data || error.response?.statusText
            });
            
            return {
                status: 'error',
                originalStatus: error.response?.status || 'unknown',
                message: error.response?.data?.Message || error.message
            };
        }
    }
    
    /**
     * Maps POLi-specific status values to standardized application status values
     * @param {string} poliStatus - Status value from POLi API
     * @returns {string} Normalized status for application use
     */
    normalizeStatus(poliStatus) {
        // Map POLi statuses to our application statuses
        const statusMap = {
            'Activated': 'pending',         // Link has been activated but payment not completed
            'Completed': 'completed',       // Payment has been completed successfully
            'Cancelled': 'cancelled',       // User cancelled the payment
            'TimedOut': 'expired',          // Payment session timed out
            'Error': 'error',               // Error occurred during payment
            'Unused': 'pending'             // Link has not been used yet
        };
        
        return statusMap[poliStatus] || 'unknown';
    }
}

module.exports = new PoliPaymentStatus();