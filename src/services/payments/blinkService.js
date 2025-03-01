/**
 * Blink Payment Service Integration
 * 
 * This service handles the integration with Blink Debit payment gateway.
 * Uses OAuth2 client credentials flow for authentication.
 * 
 * Required Environment Variables:
 * - BLINK_CLIENT_ID: OAuth2 client ID
 * - BLINK_CLIENT_SECRET: OAuth2 client secret
 * - BLINK_API_BASE_URL: Base URL for Blink API (e.g., https://sandbox.debit.blinkpay.co.nz/payments/v1)
 * - BLINK_AUTH_URL: Authentication endpoint (e.g., https://sandbox.debit.blinkpay.co.nz/oauth2/token)
 * - BLINK_REDIRECT_URL: Redirect URL after payment (e.g., https://your-domain.com)
 * - BLINK_PAYMENT_EXPIRY_MINUTES: Minutes until payment link expires (default: 30)
 */

const axios = require('axios');
const pool = require('../../config/database');
const crypto = require('crypto');
const expiryService = require('../expiry/expiryService');

class BlinkService {
    constructor() {
        // Initialize configuration from environment variables
        this.CLIENT_ID = process.env.BLINK_CLIENT_ID;
        this.CLIENT_SECRET = process.env.BLINK_CLIENT_SECRET;
        this.BASE_URL = process.env.BLINK_API_BASE_URL;
        this.AUTH_URL = process.env.BLINK_AUTH_URL;
        this.REDIRECT_URL = process.env.BLINK_REDIRECT_URL;
        
        // Token management
        this.accessToken = null;
        this.tokenExpiry = null;

        // Initialize expiry service
        this.expiryService = expiryService;

        // Configuration validation
        const requiredEnvVars = [
            'BLINK_CLIENT_ID',
            'BLINK_CLIENT_SECRET',
            'BLINK_API_BASE_URL',
            'BLINK_AUTH_URL',
            'BLINK_REDIRECT_URL',
            'BLINK_PAYMENT_EXPIRY_MINUTES'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            console.error('Missing required environment variables:', missingVars.join(', '));
            throw new Error('Missing required environment variables for Blink integration');
        }
    }

    // [Previous methods remain exactly the same: getAccessToken, ensureValidToken]
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

    async ensureValidToken() {
        if (!this.accessToken || !this.tokenExpiry || Date.now() >= this.tokenExpiry - 60000) {
            await this.getAccessToken();
        }
        return this.accessToken;
    }

    async generatePaymentLink(orderData) {
        try {
            console.log('\n=== Blink Payment Processing ===');
            console.log('Generating Blink payment link for order:', orderData.trade_order);

            const token = await this.ensureValidToken();

            const formattedAmount = typeof orderData.total_price === 'string' 
                ? parseFloat(orderData.total_price).toFixed(2)
                : orderData.total_price.toFixed(2);

            const payload = {
                flow: {
                    detail: {
                        type: "gateway",
                        redirect_uri: this.REDIRECT_URL,
                        flow_hint: {
                            type: "redirect",
                            bank: "PNZ"
                        }
                    }
                },
                pcr: {
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

            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'request-id': crypto.randomUUID(),
                'x-correlation-id': crypto.randomUUID(),
                'idempotency-key': crypto.randomUUID()
            };

            const response = await axios.post(
                `${this.BASE_URL}/quick-payments`,
                payload,
                {
                    headers: headers,
                    timeout: 10000
                }
            );

            console.log('Blink API Response:', response.data);

            if (response.data && response.data.redirect_uri) {
                await pool.query(
                    `INSERT INTO payments (
                        order_record_id, provider, status_url, amount, 
                        payment_url, payid, expires_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + interval '${process.env.BLINK_PAYMENT_EXPIRY_MINUTES} minutes')`,
                    [
                        orderData.record_id, 
                        'BLINK', 
                        'success', 
                        formattedAmount, 
                        response.data.redirect_uri,
                        response.data.quick_payment_id
                    ]
                );

                // Schedule payment expiry
                await this.expiryService.scheduleExpiry(
                    response.data.quick_payment_id,
                    'BLINK'
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
            
            await pool.query(
                `INSERT INTO payments (order_record_id, provider, status_url, amount, message_url) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [orderData.record_id, 'BLINK', 'failed', orderData.total_price, 
                 error.response?.data?.detail || error.message]
            );
            
            console.error('Blink payment link generation failed for order:', orderData.trade_order);
            throw error;
        }
    }
}

module.exports = new BlinkService();