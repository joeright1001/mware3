/**
 * Blink Payment Status Provider
 * ----------------------------
 * Purpose: Handles Blink-specific payment status checking
 * 
 * Functions:
 * - Connect to Blink API with proper authentication
 * - Query payment status using the stored quick_payment_id
 * - Return raw API responses without any normalization
 * - Maps payment status to pay_status.status and consent status to payments.status_url
 */

const axios = require('axios');

class BlinkPaymentStatus {
    constructor() {
        this.baseUrl = process.env.BLINK_API_BASE_URL;
        this.clientId = process.env.BLINK_CLIENT_ID;
        this.clientSecret = process.env.BLINK_CLIENT_SECRET;
        this.authUrl = process.env.BLINK_AUTH_URL;
        
        // Token management
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    /**
     * Get an access token for Blink API
     * @returns {string} Access token
     */
    async getAccessToken() {
        try {
            console.log('Requesting Blink access token for status check...');
            
            const payload = {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'client_credentials',
                audience: 'https://api.blinkdebit.co.nz'
            };

            const response = await axios.post(
                this.authUrl,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
            
            console.log('Successfully obtained Blink access token for status check');
            return this.accessToken;
        } catch (error) {
            console.error('Failed to get Blink access token:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Ensure we have a valid token
     * @returns {string} Valid access token
     */
    async ensureValidToken() {
        if (!this.accessToken || !this.tokenExpiry || Date.now() >= this.tokenExpiry - 60000) {
            await this.getAccessToken();
        }
        return this.accessToken;
    }

    /**
     * Check the status of a Blink payment
     * @param {string} quickPaymentId - The Blink quick_payment_id to check
     * @returns {Object} Raw status information from Blink API
     */
    async checkStatus(quickPaymentId) {
        try {
            console.log(`Checking Blink payment status for quick_payment_id: ${quickPaymentId}`);
            
            // Ensure we have a valid token
            const token = await this.ensureValidToken();
            
            // Make API request to Blink
            const response = await axios.get(
                `${this.baseUrl}/quick-payments/${quickPaymentId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );
            
            console.log(`Blink status response for ${quickPaymentId}:`, response.data);
            
            // Extract the payment status and consent status from the response
            const paymentStatus = response.data.consent?.payments?.[0]?.status || 'unknown';
            const consentStatus = response.data.consent?.status || 'unknown';
            
            return {
                // Consent status only for updating payments.status_url
                status: consentStatus,
                // Payment status only for inserting into pay_status.status
                payment_status: paymentStatus,
                originalStatus: `Consent: ${consentStatus} / Payment: ${paymentStatus}`,
                message: `Blink status check successful: Consent: ${consentStatus}, Payment: ${paymentStatus}`
            };
        } catch (error) {
            console.error(`Blink status check error for ${quickPaymentId}:`, {
                message: error.message,
                response: error.response?.data || error.response?.statusText
            });
            
            // If 404 error, payment may have been deleted or expired
            if (error.response?.status === 404) {
                return {
                    status: 'expired',
                    payment_status: 'expired',
                    originalStatus: 'expired',
                    message: 'Payment link has expired or been deleted'
                };
            }
            
            return {
                status: 'error',
                payment_status: 'error',
                originalStatus: error.response?.status || 'unknown',
                message: error.response?.data?.title || error.message
            };
        }
    }
}

module.exports = new BlinkPaymentStatus();