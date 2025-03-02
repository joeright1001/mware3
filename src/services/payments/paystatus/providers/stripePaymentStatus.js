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
                status: this.normalizeStatus(response.data.payment_status, response.data.status),
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
    
    /**
     * Maps Stripe-specific status values to standardized application status values
     * @param {string} paymentStatus - Payment status from Stripe API
     * @param {string} sessionStatus - Session status from Stripe API
     * @returns {string} Normalized status for application use
     */
    normalizeStatus(paymentStatus, sessionStatus) {
        // Handle if session is expired or incomplete
        if (sessionStatus === 'expired') return 'expired';
        if (sessionStatus === 'open') return 'pending';
        
        // Map Stripe payment statuses to our application statuses
        const statusMap = {
            'unpaid': 'pending',       // Payment has not been paid yet
            'paid': 'completed',       // Payment has been paid
            'no_payment_required': 'completed', // No payment required
            'canceled': 'cancelled'    // Payment was canceled
        };
        
        return statusMap[paymentStatus] || 'unknown';
    }
}

module.exports = new StripePaymentStatus();