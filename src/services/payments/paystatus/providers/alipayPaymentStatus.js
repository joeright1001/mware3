/**
 * Alipay Payment Status Provider
 * ----------------------------
 * Purpose: Handles Alipay-specific payment status checking
 * 
 * Functions:
 * - Connect to Stripe API (which handles Alipay)
 * - Query Checkout Session status using the stored session ID
 * - Return raw API responses without any normalization
 */

const axios = require('axios');

class AlipayPaymentStatus {
    constructor() {
        this.baseUrl = process.env.STRIPE_BASE_URL || 'https://api.stripe.com';
        this.secretKey = process.env.STRIPE_SECRET_KEY;
    }

    /**
     * Check the status of an Alipay payment
     * @param {string} sessionId - The Checkout Session ID to check
     * @returns {Object} Raw status information from Stripe API
     */
    async checkStatus(sessionId) {
        try {
            console.log(`Checking Alipay payment status for session: ${sessionId}`);
            
            // Make API request to Stripe (which powers Alipay payments)
            const response = await axios.get(
                `${this.baseUrl}/v1/checkout/sessions/${sessionId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log(`Alipay status response for ${sessionId}:`, response.data);
            
            // Check if payment method types include alipay
            const isAlipayPayment = response.data.payment_method_types &&
                                   response.data.payment_method_types.includes('alipay');
            
            if (!isAlipayPayment) {
                console.warn(`Session ${sessionId} does not appear to be an Alipay payment`);
            }
            
            return {
                // Raw status from API
                status: response.data.payment_status || 'unknown',
                originalStatus: `${response.data.status}/${response.data.payment_status}`,
                message: `Alipay status check successful: ${response.data.payment_status}`
            };
        } catch (error) {
            console.error(`Alipay status check error for ${sessionId}:`, {
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

module.exports = new AlipayPaymentStatus();