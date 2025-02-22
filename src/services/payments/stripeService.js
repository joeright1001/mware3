/**
 * Stripe Payment Service Integration
 * --------------------------------
 * Purpose: Handles Stripe Checkout Session creation for payment processing
 * 
 * Features:
 * - Creates one-time payment links using Stripe Checkout
 * - Supports single payments without inventory management
 * - 30-minute expiry on payment links
 * - Calculates fees (2.7% + $0.30)
 * - New Zealand specific restrictions
 * 
 * Required Environment Variables:
 * - STRIPE_SECRET_KEY: Stripe API secret key
 * - STRIPE_BASE_URL: Base URL for Stripe API
 * - STRIPE_LOCAL_FEE: Local fee percentage (e.g., 0.027 for 2.7%)
 * - STRIPE_SUCCESS_URL: Success redirect URL
 * - STRIPE_CANCEL_URL: Cancel redirect URL
 */

const axios = require('axios');
const pool = require('../../config/database');

class StripeService {
    constructor() {
        this.secretKey = process.env.STRIPE_SECRET_KEY;
        this.baseUrl = process.env.STRIPE_BASE_URL;
        this.feePercentage = parseFloat(process.env.STRIPE_LOCAL_FEE) || 0.027;
        this.fixedFee = 0.30; // Fixed fee in dollars
        this.successUrl = process.env.STRIPE_SUCCESS_URL;
        this.cancelUrl = process.env.STRIPE_CANCEL_URL;

        // Validate configuration
        const requiredEnvVars = [
            'STRIPE_SECRET_KEY',
            'STRIPE_BASE_URL',
            'STRIPE_SUCCESS_URL',
            'STRIPE_CANCEL_URL'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            console.warn('Missing Stripe configuration:', missingVars.join(', '));
        }
    }

    /**
     * Calculates total amount including Stripe fees
     * Formula: (base amount + 0.30) / (1 - 0.027)
     * @param {number} baseAmount - Original amount before fees
     * @returns {number} Total amount including fees
     */
    calculateTotalWithFees(baseAmount) {
        const amount = parseFloat(baseAmount);
        return (amount + this.fixedFee) / (1 - this.feePercentage);
    }

    /**
     * Generates a Stripe Checkout Session payment link
     * @param {Object} orderData - Order information including amount and reference
     * @returns {String} Checkout session URL
     */
    async generatePaymentLink(orderData) {
        try {
            console.log('\n=== Stripe Payment Processing ===');
            console.log('Generating Stripe payment link for order:', orderData.trade_order);

            // Calculate total amount including fees
            const baseAmount = parseFloat(orderData.total_price);
            const totalWithFees = this.calculateTotalWithFees(baseAmount);
            
            // Convert to cents for Stripe
            const amountInCents = Math.round(totalWithFees * 100);

            console.log('Payment calculation:', {
                baseAmount,
                feePercentage: this.feePercentage,
                fixedFee: this.fixedFee,
                totalWithFees,
                amountInCents
            });

            const payload = {
                mode: 'payment',
                success_url: this.successUrl,
                cancel_url: this.cancelUrl,
                currency: 'nzd',
                payment_method_types: ['card'],
                
                billing_address_collection: 'required',
                shipping_address_collection: {
                    allowed_countries: ['NZ']
                },

                line_items: [{
                    price_data: {
                        currency: 'nzd',
                        product_data: {
                            name: orderData.product_name_full || 'Gold Purchase',
                            description: `Order: ${orderData.trade_order} (Includes processing fee)`
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

            console.log('Stripe Checkout Session created:', response.data.id);

            if (response.data && response.data.url) {
                // Store payment record with original amount (not including fees)
                await pool.query(
                    `INSERT INTO payments (
                        order_record_id, provider, status, amount, 
                        payment_url, payid, expires_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + interval '30 minutes')`,
                    [
                        orderData.record_id,
                        'STRIPE',
                        'success',
                        orderData.total_price, // Store original amount
                        response.data.url,
                        response.data.id
                    ]
                );

                return response.data.url;
            } else {
                throw new Error('Invalid response from Stripe');
            }

        } catch (error) {
            console.error('\n=== Stripe API Error ===');
            console.error('Error details:', {
                message: error.message,
                response: error.response?.data,
                order: orderData.trade_order
            });

            // Store failed payment record
            await pool.query(
                `INSERT INTO payments (
                    order_record_id, provider, status, amount, error_message
                ) VALUES ($1, $2, $3, $4, $5)`,
                [
                    orderData.record_id,
                    'STRIPE',
                    'failed',
                    orderData.total_price,
                    error.response?.data?.error?.message || error.message
                ]
            );

            throw error;
        }
    }
}

module.exports = new StripeService();