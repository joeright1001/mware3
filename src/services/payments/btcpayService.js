/**
 * BTCPay Server Payment Integration
 */

const axios = require('axios');
const pool = require('../../config/database');

class BTCPayService {
    constructor() {
        // Remove trailing slash if present in API URL
        this.API_URL = process.env.BTCPAY_API_URL?.replace(/\/$/, '');
        this.API_KEY = process.env.BTCPAY_API_KEY;
        this.STORE_ID = process.env.BTCPAY_STORE_ID;

        // Validate configuration
        if (!this.API_URL || !this.API_KEY || !this.STORE_ID) {
            console.warn('BTCPay Server configuration incomplete');
        }
    }

    async generatePaymentLink(orderData) {
        try {
            console.log('\n=== BTCPay Payment Processing ===');
            console.log('Generating BTCPay invoice for order:', orderData.trade_order);

            // Format amount properly
            const formattedAmount = typeof orderData.total_price === 'string' 
                ? parseFloat(orderData.total_price).toFixed(2)
                : orderData.total_price.toFixed(2);

            const payload = {
                metadata: {
                    orderId: orderData.trade_order,
                    buyerName: orderData.first_name_order,
                    buyerEmail: orderData.email_order,
                    itemDesc: orderData.product_name_full || 'Gold Purchase'
                },
                amount: formattedAmount,
                currency: "NZD",
                checkout: {
                    speedPolicy: "MediumSpeed",
                    paymentMethods: ["BTC"],
                    redirectURL: process.env.BTCPAY_REDIRECT_URL,
                    defaultLanguage: "en"
                }
            };

            console.log('BTCPay request configuration:', {
                url: `${this.API_URL}/api/v1/stores/${this.STORE_ID}/invoices`,
                storeId: this.STORE_ID,
                authHeader: `token ${this.API_KEY}`
            });

            const response = await axios.post(
                `${this.API_URL}/api/v1/stores/${this.STORE_ID}/invoices`,
                payload,
                {
                    headers: {
                        'Authorization': `token ${this.API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('BTCPay API Response:', response.data);

            if (response.data && response.data.checkoutLink) {
                // Store payment record
                await pool.query(
                    `INSERT INTO payments (
                        order_record_id, provider, status, amount, 
                        payment_url, payid
                    ) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        orderData.record_id,
                        'BTCPAY',
                        'success',
                        formattedAmount,
                        response.data.checkoutLink,
                        response.data.id
                    ]
                );

                return response.data.checkoutLink;
            } else {
                throw new Error('Invalid response from BTCPay Server');
            }

        } catch (error) {
            console.error('\n=== BTCPay API Error ===');
            console.error('Error details:', {
                message: error.message,
                response: error.response?.data,
                order: orderData.trade_order,
                config: error.config
            });

            // Store failed payment record
            await pool.query(
                `INSERT INTO payments (
                    order_record_id, provider, status, amount, error_message
                ) VALUES ($1, $2, $3, $4, $5)`,
                [
                    orderData.record_id,
                    'BTCPAY',
                    'failed',
                    orderData.total_price,
                    error.response?.data?.message || error.message
                ]
            );

            throw error;
        }
    }
}

module.exports = new BTCPayService();