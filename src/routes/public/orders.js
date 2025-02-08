/**
 * Order Routes
 * -----------
 * Purpose: Defines all HTTP endpoints related to orders
 * Role: Handles HTTP requests and delegates business logic to OrderService
 * 
 * Current Endpoints:
 * POST /create - Creates a new order
 * 
 * Dependencies:
 * - OrderService for business logic
 * - Express Router for routing
 * 
 * Error Handling:
 * - 400 for validation errors
 * - 500 for server errors
 */

const express = require('express');
const router = express.Router();
const OrderService = require('../../services/orders/orderService');

router.post("/create", async (req, res) => {
    try {
        const result = await OrderService.createOrder(req.body);
        res.json(result);
    } catch (error) {
        console.error("Order creation error:", error);
        res.status(error.message.includes("required") ? 400 : 500)
           .json({ error: error.message || "Failed to create order" });
    }
});

module.exports = router;