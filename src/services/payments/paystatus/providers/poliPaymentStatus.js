/**
 * POLi Payment Status Provider
 * ----------------------------
 * Purpose: Handles POLi-specific payment status checking
 * 
 * Functions:
 * - Connect to POLi API with proper authentication
 * - Query payment status using the stored token/payid
 * - Return raw API responses without any normalization
 * - Provide raw status for both status_pay and status_url columns
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
     * @returns {Object} Raw status information from POLi API
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
            
            // POLi returns the status as a quoted string like "Activated" - remove quotes if needed
            const status = typeof response.data === 'string' 
                ? response.data.replace(/^"|"$/g, '') 
                : response.data;
            
            return {
                // Raw status for status_pay column
                status: status,
                // Same raw status for status_url column
                status_url: status,
                // For compatibility with existing code
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
                status_url: 'error',
                originalStatus: error.response?.status || 'unknown',
                message: error.response?.data?.Message || error.message
            };
        }
    }
}

module.exports = new PoliPaymentStatus();