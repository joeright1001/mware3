/**
 * Blink Payment Service Integration
 * 
 * This service handles the integration with Blink Debit payment gateway.
 * Uses OAuth2 client credentials flow for authentication.
 * 
 * API Documentation Reference:
 * - Quick Payment Creation
 * - Authentication Flow
 * - PCR (Particulars, Code, Reference) Requirements
 */

const axios = require('axios');
const pool = require('../../config/database');
const crypto = require('crypto'); // For generating UUIDs

class BlinkService {
    constructor() {
        // Initialize configuration from environment variables
        this.CLIENT_ID = process.env.BLINK_CLIENT_ID;
        this.CLIENT_SECRET = process.env.BLINK_CLIENT_SECRET;
        this.BASE_URL = 'https://sandbox.debit.blinkpay.co.nz/payments/v1';
        this.AUTH_URL = 'https://sandbox.debit.blinkpay.co.nz/oauth2/token';
        this.REDIRECT_URL = 'https://gold-buyers-christchurch.webflow.io/';
        
        // Token management
        this.accessToken = null;
        this.tokenExpiry = null;

        // Configuration validation
        if (!this.CLIENT_ID || !this.CLIENT_SECRET) {
            console.error('Missing Blink API credentials. Check environment variables.');
        }
    }

    /**
     * Obtains a new access token using client credentials
     * @returns {Promise<string>} The access token
     * @throws {Error} If token acquisition fails
     */
    async getAccessToken() {
        try {
            console.log('\n=== Blink Authentication ===');
            console.log('Requesting Blink access token...');
            
            const payload = {
                client_id: this.CLIENT_ID,
                client_secret: this.CLIENT_SECRET,
                grant_type: 'client_credentials',
                audience: 'https://api.blinkdebit.co.nz'
            };

            const response = await axios.post(
                this.AUTH_URL,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
            
            console.log('Successfully obtained Blink access token');
            return this.accessToken;
        } catch (error) {
            console.error('Failed to get Blink access token:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Ensures a valid token is available
     * Refreshes token if expired or close to expiry
     * @returns {Promise<string>} Valid access token
     */
    async ensureValidToken() {
        if (!this.accessToken || !this.tokenExpiry || Date.now() >= this.tokenExpiry - 60000) {
            await this.getAccessToken();
        }
        return this.accessToken;
    }

    /**
     * Generates a payment link for an order
     * @param {Object} orderData Order details including amount and reference
     * @returns {Promise<string>} Payment redirect URL
     * @throws {Error} If payment link generation fails
     */
    async generatePaymentLink(orderData) {
        try {
            console.log('\n=== Blink Payment Processing ===');
            console.log('Generating Blink payment link for order:', orderData.trade_order);

            // Ensure valid token
            const token = await this.ensureValidToken();

            // Format amount to 2 decimal places
            const formattedAmount = typeof orderData.total_price === 'string' 
                ? parseFloat(orderData.total_price).toFixed(2)
                : orderData.total_price.toFixed(2);

            // Construct payload according to API specifications
            const payload = {
                flow: {
                    detail: {
                        type: "gateway",
                        redirect_uri: this.REDIRECT_URL,
                        flow_hint: {
                            type: "redirect",
                            bank: "PNZ" // Pay NZ as default bank
                        }
                    }
                },
                pcr: {
                    // Ensure PCR fields meet character requirements
                    particulars: orderData.trade_order.substring(0, 12).replace(/[^a-zA-Z0-9- &#?:_\/,.']/g, ''),
                    code: orderData.trade_order.substring(0, 12).replace(/[^a-zA-Z0-9- &#?:_\/,.']/g, ''),
                    reference: orderData.record_id.toString().substring(0, 12)
                },
                amount: {
                    total: formattedAmount,
                    currency: "NZD"
                }
            };

            console.log('Blink API Payload:', JSON.stringify(payload));

            // Generate required header values
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'request-id': crypto.randomUUID(),
                'x-correlation-id': crypto.randomUUID(),
                'idempotency-key': crypto.randomUUID()
            };

            // Make API request
            const response = await axios.post(
                `${this.BASE_URL}/quick-payments`,
                payload,
                {
                    headers: headers,
                    timeout: 10000
                }
            );

            console.log('Blink API Response:', response.data);

            // Handle successful response
            if (response.data && response.data.redirect_uri) {
                // Store payment record in database
                await pool.query(
                    `INSERT INTO payments (order_record_id, provider, status, amount, payment_url) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [orderData.record_id, 'BLINK', 'pending', formattedAmount, response.data.redirect_uri]
                );

                return response.data.redirect_uri;
            } else {
                throw new Error('No redirect_uri in response');
            }

        } catch (error) {
            console.error('\n=== Blink API Error ===');
            console.error('Error details:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                headers: error.response?.headers,
                order: orderData.trade_order
            });
            
            // Store failed payment attempt in database
            await pool.query(
                `INSERT INTO payments (order_record_id, provider, status, amount, error_message) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [orderData.record_id, 'BLINK', 'failed', orderData.total_price, 
                 error.response?.data?.detail || error.message]
            );
            
            throw error;
        }
    }
}

module.exports = new BlinkService();