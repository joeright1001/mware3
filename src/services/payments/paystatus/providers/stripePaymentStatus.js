/**
 * Stripe Payment Status Provider
 * ----------------------------
 * Purpose: Handles Stripe-specific payment status checking
 * 
 * Functions:
 * - Connect to Stripe API with proper authentication
 * - Query Checkout Session status using the stored session ID
 * - Parse and normalize API responses
 * - Handle Stripe-specific error conditions
 */

const axios = require('axios');

class StripePaymentStatus {
    constructor() {
        this.baseUrl = process.env.STRIPE_BASE_URL || 'https://api.stripe.com';
        this.secretKey = process.env.STRIPE_SECRET_KEY;
    }

    /**
     * Check the status of a Stripe payment
     * @param {string} sessionId - The Checkout Session ID to check
     * @returns {Object} Normalized status information
     */
    async checkStatus(sessionId) {
        try {
            console.log(`Checking Stripe payment status for session: ${sessionId}`);
            
            // Make API request to Stripe
            const response = await axios.get(
                `${this.baseUrl}/v1/checkout/sessions/${sessionId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log(`Stripe status response for ${sessionId}:`, response.data);
            
            return {
                status: response.data.payment_status || 'unknown',
                originalStatus: `${response.data.status}/${response.data.payment_status}`,
                message: `Stripe status check successful: ${response.data.payment_status}`
            };
        } catch (error) {
            console.error(`Stripe status check error for ${sessionId}:`, {
                message: error.message,
                response: error.response?.data || error.response?.statusText
            });
            
            return {
                status: 'error',
                originalStatus: error.response?.status || 'unknown',
                message: error.response?.data?.error?.message || error.message
            };
        }
    }
}

module.exports = new StripePaymentStatus();