/**
 * Order Service
 * ------------
 * Purpose: Handles all business logic related to orders
 * Role: Centralizes order-related operations and database interactions
 * 
 * Key Features:
 * 1. Trade Order Generation (TO-XXXX format)
 * 2. Order Creation with validation
 * 3. JWT Token generation for order tracking
 * 
 * Dependencies:
 * - Database connection
 * - JWT for token generation
 * - JWT_SECRET environment variable
 * 
 * IMPORTANT CONFIGURATIONS:
 * - Starting order number: TO-2317 (modify if needed)
 * - JWT expiration time: 1h (modify if needed)
 * - JWT_SECRET in .env file
 */

const pool = require('../../config/database');
const jwt = require('jsonwebtoken');

class OrderService {
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
            zoho_id, delivery, pay_in_person, checkbox_order, address, message, poli_pay,
            date_picker_order, time_picker_order
        } = orderData;

        // Validation
        if (!first_name_order || !email_order || !total_price) {
            throw new Error("First name, email, and total price are required.");
        }

        const trade_order = await this.getNextTradeOrder();

        // ⚠️ CONFIGURE: JWT settings
        const token = jwt.sign(
            { trade_order, email_order, timestamp: Date.now() }, 
            process.env.JWT_SECRET || "default_secret", 
            { expiresIn: "1h" }  // Modify token expiration time if needed
        );

        // Insert order
        await pool.query(
            `INSERT INTO orders (
                trade_order, first_name_order, last_name_order, email_order, phone_order,
                product_name_full, total_price, quantity, price_nzd, zoho_id, delivery,
                pay_in_person, checkbox_order, address, message, poli_pay, token,
                date_picker_order, time_picker_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
            [
                trade_order, first_name_order, last_name_order || null, email_order, phone_order || null,
                product_name_full || null, total_price, quantity || null, price_nzd || null, zoho_id || null,
                delivery || null, pay_in_person || null, checkbox_order || null, address || null,
                message || null, poli_pay || null, token,
                date_picker_order || null, time_picker_order || null
            ]
        );

        return { token, trade_order };
    }
}

module.exports = new OrderService();