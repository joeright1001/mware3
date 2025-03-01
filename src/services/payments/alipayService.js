/**
 * Alipay Service Integration (via Stripe)
 * -------------------------------------
 * Purpose: Handles Alipay-specific payment processing through Stripe Checkout
 * 
 * Features:
 * - Creates Alipay-only payment links using Stripe Checkout
 * - Implements 3% processing fee for Alipay transactions
 * - Restricts payment method to Alipay only
 * - Supports CNY currency for Alipay transactions
 * 
 * Environment Variables:
 * - STRIPE_SECRET_KEY: Stripe API secret key
 * - STRIPE_BASE_URL: Base URL for Stripe API
 * - STRIPE_ALIPAY_FEE: Alipay processing fee (e.g., 0.03 for 3%)
 * - STRIPE_SUCCESS_URL: Success redirect URL
 * - STRIPE_CANCEL_URL: Cancel redirect URL
 */

const axios = require('axios');
const pool = require('../../config/database');

class AlipayService {
    constructor() {
        this.secretKey = process.env.STRIPE_SECRET_KEY;
        this.baseUrl = process.env.STRIPE_BASE_URL;
        this.feePercentage = parseFloat(process.env.STRIPE_ALIPAY_FEE) || 0.03;
        this.successUrl = process.env.STRIPE_SUCCESS_URL;
        this.cancelUrl = process.env.STRIPE_CANCEL_URL;

        // Validate configuration
        const requiredEnvVars = [
            'STRIPE_SECRET_KEY',
            'STRIPE_BASE_URL',
            'STRIPE_SUCCESS_URL',
            'STRIPE_CANCEL_URL',
            'STRIPE_ALIPAY_FEE'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            console.warn('Missing Alipay configuration:', missingVars.join(', '));
        }
    }

    /**
     * Calculates total amount including Alipay processing fee
     * @param {number} baseAmount - Original amount before fees
     * @returns {number} Total amount including fees
     */
    calculateTotalWithFees(baseAmount) {
        const amount = parseFloat(baseAmount);
        return amount * (1 + this.feePercentage);
    }

    /**
     * Generates an Alipay-only payment link via Stripe
     * @param {Object} orderData - Order information including amount and reference
     * @returns {String} Checkout session URL
     */
    async generatePaymentLink(orderData) {
        try {
            console.log('\n=== Alipay Payment Processing ===');
            console.log('Generating Alipay payment link for order:', orderData.trade_order);

            // Calculate total amount including Alipay fee
            const baseAmount = parseFloat(orderData.total_price);
            const totalWithFees = this.calculateTotalWithFees(baseAmount);
            const amountInCents = Math.round(totalWithFees * 100);

            console.log('Alipay payment calculation:', {
                baseAmount,
                feePercentage: this.feePercentage,
                totalWithFees,
                amountInCents
            });

            const payload = {
                mode: 'payment',
                success_url: this.successUrl,
                cancel_url: this.cancelUrl,
                payment_method_types: ['alipay'],
                currency: 'nzd',

                line_items: [{
                    price_data: {
                        currency: 'nzd',
                        product_data: {
                            name: orderData.product_name_full || 'Gold Purchase',
                            description: `Order: ${orderData.trade_order} (Includes Alipay fee)`
                        },
                        unit_amount: amountInCents
                    },
                    quantity: 1
                }],

                customer_email: orderData.email_order || undefined,
                client_reference_id: orderData.trade_order,
                expires_at: Math.floor(Date.now() / 1000) + (30 * 60)
            };

            const response = await axios.post(
                `${this.baseUrl}/v1/checkout/sessions`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            console.log('Alipay Checkout Session created:', response.data.id);

            if (response.data && response.data.url) {
                // Store payment record
                await pool.query(
                    `INSERT INTO payments (
                        order_record_id, provider, status_url, amount, 
                        payment_url, payid, expires_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + interval '30 minutes')`,
                    [
                        orderData.record_id,
                        'ALIPAY',
                        'success',
                        orderData.total_price,
                        response.data.url,
                        response.data.id
                    ]
                );

                return response.data.url;
            } else {
                throw new Error('Invalid response from Stripe for Alipay');
            }

        } catch (error) {
            console.error('\n=== Alipay API Error ===');
            console.error('Error details:', {
                message: error.message,
                response: error.response?.data,
                order: orderData.trade_order
            });

            // Store failed payment record
            await pool.query(
                `INSERT INTO payments (
                    order_record_id, provider, status_url, amount, message_url
                ) VALUES ($1, $2, $3, $4, $5)`,
                [
                    orderData.record_id,
                    'ALIPAY',
                    'failed',
                    orderData.total_price,
                    error.response?.data?.error?.message || error.message
                ]
            );

            throw error;
        }
    }
}

module.exports = new AlipayService();