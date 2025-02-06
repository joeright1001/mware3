require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();

// ✅ Allow Webflow to send requests
const corsOptions = {
    origin: "https://gold-buyers-christchurch.webflow.io", 
    methods: "GET,POST,OPTIONS",
    allowedHeaders: "Content-Type",
};
app.use(cors(corsOptions));
app.use(express.json());

// ✅ Connect to PostgreSQL
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ✅ Function to generate next TO Number
async function getNextOrderId() {
    const result = await pool.query("SELECT id FROM orders ORDER BY id DESC LIMIT 1");
    if (result.rows.length > 0) {
        const lastId = parseInt(result.rows[0].id.replace("TO-", ""), 10);
        return `TO-${lastId + 1}`;
    }
    return "TO-1783"; // Start from TO-1783 if no orders exist
}

// ✅ Function to generate JWT token
function generateToken(orderId) {
    return jwt.sign({ orderId, timestamp: Date.now() }, process.env.JWT_SECRET || "default_secret", {
        expiresIn: "1h",
    });
}

// ✅ Home Route - Display All Orders
app.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
        let ordersHtml = result.rows.map(order => `
            <tr>
                <td>${order.id}</td>
                <td>${order.first_name_order}</td>
                <td>${order.last_name_order}</td>
                <td>${order.email_order}</td>
                <td>${order.phone_order}</td>
                <td>${order.product_name_full}</td>
                <td>${order.total_price}</td>
                <td>${order.quantity}</td>
                <td>${order.price_nzd}</td>
                <td>${order.zoho_id}</td>
                <td>${order.delivery}</td>
                <td>${order.pay_in_person}</td>
                <td>${order.checkbox_order}</td>
                <td>${order.address}</td>
                <td>${order.message}</td>
                <td>${order.payment_url}</td>
                <td>${order.trade_order}</td>
                <td>${order.poli_pay}</td>
                <td>${order.token}</td>
            </tr>
        `).join("");

        res.send(`
            <h2>All Orders</h2>
            <table border='1'>
                <tr>
                    <th>Order ID</th><th>First Name</th><th>Last Name</th><th>Email</th><th>Phone</th>
                    <th>Product Name</th><th>Total Price</th><th>Quantity</th><th>Price NZD</th><th>Zoho ID</th>
                    <th>Delivery</th><th>Pay in Person</th><th>Checkbox Order</th><th>Address</th><th>Message</th>
                    <th>Payment URL</th><th>Trade Order</th><th>Poli Pay</th><th>Token</th>
                </tr>
                ${ordersHtml}
            </table>
        `);
    } catch (error) {
        console.error("Database query error:", error);
        res.status(500).send("Error retrieving orders");
    }
});

// ✅ Create Order Route
app.post("/create-order", async (req, res) => {
    try {
        const {
            first_name_order, last_name_order, email_order, phone_order,
            product_name_full, total_price, quantity, price_nzd, zoho_id, delivery,
            pay_in_person, checkbox_order, address, message, trade_order, poli_pay
        } = req.body;

        if (!first_name_order) {
            return res.status(400).json({ error: "First name is required" });
        }

        // ✅ Generate next TO number
        const orderId = await getNextOrderId();

        // ✅ Generate a token
        const secureToken = generateToken(orderId);

        // ✅ Simulated Payment URL
        const paymentUrl = `https://paymentprocessor.com/checkout/${orderId}`;

        await pool.query(
            `INSERT INTO orders (id, first_name_order, last_name_order, email_order, phone_order,
                product_name_full, total_price, quantity, price_nzd, zoho_id, delivery, 
                pay_in_person, checkbox_order, address, message, payment_url, trade_order, poli_pay, token) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
            [orderId, first_name_order, last_name_order, email_order, phone_order,
             product_name_full, total_price, quantity, price_nzd, zoho_id, delivery,
             pay_in_person, checkbox_order, address, message, paymentUrl, trade_order, poli_pay, secureToken]
        );

        res.json({ orderId, paymentUrl, secureToken });

    } catch (error) {
        console.error("Order creation error:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
});

// ✅ Server Setup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
