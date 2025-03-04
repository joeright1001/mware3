/**
 * Order Service Module
 * ===================
 * This service handles the creation and management of orders in the system.
 * It provides functionality for:
 * - Generating unique trade order numbers
 * - Creating new orders with customer and product details
 * - Managing order transactions with database integration
 * - Generating payment links through multiple payment providers
 * 
 * Key Requirements:
 * - PostgreSQL database connection
 * - JWT for token generation
 * - POLi payment service integration
 * - Blink payment service integration
 * - BTCPay Server integration for Bitcoin payments
 * - Stripe payment service integration
 * - Alipay payment service integration
 * - Environment variables for JWT secret
 */

const pool = require('../../config/database');
const jwt = require('jsonwebtoken');
const PoliService = require('../payments/poliService');
const BlinkService = require('../payments/blinkService');
const BTCPayService = require('../payments/btcpayService');
const StripeService = require('../payments/stripeService');
const AlipayService = require('../payments/alipayService');
const { schedulePdfGeneration } = require('../pdf/pdfQueue');

class OrderService {
    /**
     * Generates the next sequential trade order number
     * Formats: "TO-XXXX" where XXXX is an incrementing number
     * Default starts at TO-2317 if no previous orders exist
     */
    async getNextTradeOrder() {
        const result = await pool.query("SELECT trade_order FROM orders ORDER BY record_id DESC LIMIT 1");

        // ⚠️ CONFIGURE: Change starting number if needed
        const DEFAULT_START = "TO-2317";

        if (result.rows.length === 0 || !result.rows[0].trade_order || result.rows[0].trade_order.trim() === "") {
            return DEFAULT_START;
        }

        const lastTradeOrder = result.rows[0].trade_order.trim();

        if (typeof lastTradeOrder === "string" && lastTradeOrder.startsWith("TO-")) {
            const lastNumber = parseInt(lastTradeOrder.replace("TO-", ""), 10);
            return `TO-${lastNumber + 1}`;
        }

        return DEFAULT_START;
    }

    /**
     * Creates a new order in the system
     * @param {Object} orderData - Contains all order details including customer info and product details
     * @returns {Object} Contains generated token and trade order number
     */
    async createOrder(orderData) {
        const {
            first_name_order, email_order, total_price, // Required fields
            last_name_order, phone_order, product_name_full, quantity, price_nzd,
            zoho_id, delivery, pay_in_person, checkbox_order, address, message,
            date_picker_order, time_picker_order
        } = orderData;

        // Input validation for required fields
        if (!first_name_order || !email_order || !total_price) {
            throw new Error("First name, email, and total price are required.");
        }

        const trade_order = await this.getNextTradeOrder();

        // Database transaction handling
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Generate JWT token for order tracking
            const token = jwt.sign(
                { trade_order, email_order, timestamp: Date.now() },
                process.env.JWT_SECRET || "default_secret",
                { expiresIn: "1h" }
            );

            // Insert order into database
            const orderResult = await client.query(
                `INSERT INTO orders (
                    trade_order, first_name_order, last_name_order, email_order, phone_order,
                    product_name_full, total_price, quantity, price_nzd, zoho_id, delivery,
                    pay_in_person, checkbox_order, address, message, token,
                    date_picker_order, time_picker_order
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                RETURNING record_id, order_creation_time`,
                [
                    trade_order, first_name_order, last_name_order || null, email_order, phone_order || null,
                    product_name_full || null, total_price, quantity || null, price_nzd || null, zoho_id || null,
                    delivery || null, pay_in_person || null, checkbox_order || null, address || null,
                    message || null, token, date_picker_order || null, time_picker_order || null
                ]
            );

            await client.query('COMMIT');

            // Prepare order data for payment processing
            const orderWithId = {
                ...orderData,
                record_id: orderResult.rows[0].record_id,
                trade_order
            };

            // Format timestamp for New Zealand timezone
            const timestamp = orderResult.rows[0].order_creation_time;
            const formattedDate = new Date(timestamp).toLocaleString('en-NZ', {
                timeZone: 'Pacific/Auckland',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).replace(/\//g, '-');

            // Asynchronously generate payment links
            this.generatePaymentLinks(orderWithId);

            // Schedule PDF generation 60 seconds after order creation
            try {
                await schedulePdfGeneration(trade_order, 60);
                console.log(`PDF generation scheduled for order ${trade_order}`);
            } catch (error) {
                console.error(`Failed to schedule PDF generation for order ${trade_order}:`, error);
                // Non-blocking - don't throw the error
            }

            return { token, trade_order, order_creation_time: formattedDate };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Generates payment links through multiple payment providers
     * Runs asynchronously to not block the order creation process
     * Handles all payment processing in parallel
     * @param {Object} orderData - Complete order information including record_id
     */
    async generatePaymentLinks(orderData) {
        try {
            console.log('\n=== Starting Payment Processing ===');
            console.log('Processing order:', orderData.trade_order);
            
            await Promise.all([
                // POLi payment processing
                (async () => {
                    try {
                        await PoliService.generatePaymentLink(orderData);
                    } catch (error) {
                        console.error('POLi processing failed:', error.message);
                    }
                })(),
                // Blink payment processing
                (async () => {
                    try {
                        await BlinkService.generatePaymentLink(orderData);
                    } catch (error) {
                        console.error('Blink processing failed:', error.message);
                    }
                })(),
                // BTCPay processing
                (async () => {
                    try {
                        if (process.env.BTCPAY_API_KEY && process.env.BTCPAY_STORE_ID) {
                            await BTCPayService.generatePaymentLink(orderData);
                        } else {
                            console.log('BTCPay configuration not found, skipping Bitcoin payment processing');
                        }
                    } catch (error) {
                        console.error('BTCPay processing failed:', error.message);
                    }
                })(),
                // Stripe payment processing
                (async () => {
                    try {
                        if (process.env.STRIPE_SECRET_KEY) {
                            await StripeService.generatePaymentLink(orderData);
                        } else {
                            console.log('Stripe configuration not found, skipping Stripe payment processing');
                        }
                    } catch (error) {
                        console.error('Stripe processing failed:', error.message);
                    }
                })(),
                // Alipay processing
                (async () => {
                    try {
                        if (process.env.STRIPE_ALIPAY_FEE) {
                            await AlipayService.generatePaymentLink(orderData);
                        } else {
                            console.log('Alipay configuration not found, skipping Alipay payment processing');
                        }
                    } catch (error) {
                        console.error('Alipay processing failed:', error.message);
                    }
                })()
            ]);

            console.log('=== Payment Processing Complete ===\n');
        } catch (error) {
            console.error('Payment link generation failed:', error);
            // Don't throw - this is background processing
        }
    }
}

module.exports = new OrderService();