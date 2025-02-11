// src/services/orders/orderService.js
const pool = require('../../config/database');
const jwt = require('jsonwebtoken');
const PoliService = require('../payments/poliService');

class OrderService {
    // Keep this method - it was missing in the update
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

    async createOrder(orderData) {
        const {
            first_name_order, email_order, total_price, // Required fields
            last_name_order, phone_order, product_name_full, quantity, price_nzd,
            zoho_id, delivery, pay_in_person, checkbox_order, address, message,
            date_picker_order, time_picker_order
        } = orderData;

        // Validation
        if (!first_name_order || !email_order || !total_price) {
            throw new Error("First name, email, and total price are required.");
        }

        const trade_order = await this.getNextTradeOrder();

        // Start transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const token = jwt.sign(
                { trade_order, email_order, timestamp: Date.now() },
                process.env.JWT_SECRET || "default_secret",
                { expiresIn: "1h" }
            );

            // Insert order and get record_id
            const orderResult = await client.query(
                `INSERT INTO orders (
                    trade_order, first_name_order, last_name_order, email_order, phone_order,
                    product_name_full, total_price, quantity, price_nzd, zoho_id, delivery,
                    pay_in_person, checkbox_order, address, message, token,
                    date_picker_order, time_picker_order
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                RETURNING record_id`,
                [
                    trade_order, first_name_order, last_name_order || null, email_order, phone_order || null,
                    product_name_full || null, total_price, quantity || null, price_nzd || null, zoho_id || null,
                    delivery || null, pay_in_person || null, checkbox_order || null, address || null,
                    message || null, token, date_picker_order || null, time_picker_order || null
                ]
            );

            await client.query('COMMIT');

            // Generate POLi payment link asynchronously
            const orderWithId = {
                ...orderData,
                record_id: orderResult.rows[0].record_id,
                trade_order
            };
            
            // Don't await - let it process in background
            this.generatePaymentLink(orderWithId);

            return { token, trade_order };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async generatePaymentLink(orderData) {
        try {
            await PoliService.generatePaymentLink(orderData);
        } catch (error) {
            console.error('Payment link generation failed:', error);
            // Don't throw - this is background processing
        }
    }
}

module.exports = new OrderService();