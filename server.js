require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();

const corsOptions = {
    origin: "https://gold-buyers-christchurch.webflow.io",
    methods: "GET,POST,OPTIONS",
    allowedHeaders: "Content-Type",
};
app.use(cors(corsOptions));
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Changed function name and starting number to 2317
async function getNextTradeOrder() {
    const result = await pool.query("SELECT trade_order FROM orders ORDER BY record_id DESC LIMIT 1");

    if (result.rows.length === 0 || !result.rows[0].trade_order || result.rows[0].trade_order.trim() === "") {
        return "TO-2317"; // Changed starting number
    }

    const lastTradeOrder = result.rows[0].trade_order.trim(); // Changed variable name

    if (typeof lastTradeOrder === "string" && lastTradeOrder.startsWith("TO-")) {
        const lastNumber = parseInt(lastTradeOrder.replace("TO-", ""), 10);
        return `TO-${lastNumber + 1}`;
    }

    return "TO-2317"; // Changed fallback number
}

app.post("/create-order", async (req, res) => {
    try {
        const {
            first_name_order, email_order, total_price, // Required
            last_name_order, phone_order, product_name_full, quantity, price_nzd,
            zoho_id, delivery, pay_in_person, checkbox_order, address, message, poli_pay,
            date_picker_order, time_picker_order
        } = req.body;

        if (!first_name_order || !email_order || !total_price) {
            return res.status(400).json({ error: "First name, email, and total price are required." });
        }

        // Changed to trade_order
        const trade_order = await getNextTradeOrder();

        // Updated JWT payload to use trade_order
        const token = jwt.sign({ trade_order, email_order, timestamp: Date.now() }, process.env.JWT_SECRET || "default_secret", {
            expiresIn: "1h",
        });

        // Updated query to use trade_order
        await pool.query(
            `INSERT INTO orders (trade_order, first_name_order, last_name_order, email_order, phone_order,
                product_name_full, total_price, quantity, price_nzd, zoho_id, delivery,
                pay_in_person, checkbox_order, address, message, poli_pay, token,
                date_picker_order, time_picker_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`, 
            [trade_order, first_name_order, last_name_order || null, email_order, phone_order || null,
             product_name_full || null, total_price, quantity || null, price_nzd || null, zoho_id || null, 
             delivery || null, pay_in_person || null, checkbox_order || null, address || null, 
             message || null, poli_pay || null, token, 
             date_picker_order || null, time_picker_order || null]
        );

        // Updated response to use trade_order
        res.json({ token, trade_order });

    } catch (error) {
        console.error("Order creation error:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));