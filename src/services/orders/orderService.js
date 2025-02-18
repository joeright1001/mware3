/**
 * Order Service Module
 * ===================
 * This service handles the creation and management of orders in the system.
 * It provides functionality for:
 * - Generating unique trade order numbers
 * - Creating new orders with customer and product details
 * - Managing order transactions with database integration
 * - Generating payment links through payment providers
 * 
 * Key Requirements:
 * - PostgreSQL database connection
 * - JWT for token generation
 * - POLi payment service integration
 * - Blink payment service integration
 * - Environment variables for JWT secret
 * 
 * Flow:
 * 1. Generate unique trade order number
 * 2. Create order record in database
 * 3. Generate JWT token for order
 * 4. Initiate parallel payment link generation (async)
 *    - POLi payment processing
 *    - Blink payment processing
 */

const pool = require('../../config/database');
const jwt = require('jsonwebtoken');
const PoliService = require('../payments/poliService');
const BlinkService = require('../payments/blinkService');

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

            // Before the return statement, format the timestamp
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
            this.generatePaymentLink(orderWithId);

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
     * Handles both POLi and Blink payment processing in parallel
     * @param {Object} orderData - Complete order information including record_id
     */
    async generatePaymentLink(orderData) {
        try {
            console.log('\n=== Starting Payment Processing ===');
            console.log('Processing order:', orderData.trade_order);
            
            await Promise.all([
                (async () => {
                    try {
                        await PoliService.generatePaymentLink(orderData);
                    } catch (error) {
                        console.error('POLi processing failed:', error.message);
                    }
                })(),
                (async () => {
                    try {
                        await BlinkService.generatePaymentLink(orderData);
                    } catch (error) {
                        console.error('Blink processing failed:', error.message);
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