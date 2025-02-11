/**
 * Payment Routes
 * -------------
 * Purpose: Handles payment status checking endpoints
 * Role: Provides API for checking payment URL status
 * 
 * Endpoints:
 * GET /api/payment-status/:token - Check payment URL status
 * 
 * Dependencies:
 * - PaymentService for business logic
 * - Express Router for routing
 * 
 * Error Handling:
 * - 400 for validation errors
 * - 500 for server errors
 */

const express = require('express');
const router = express.Router();
const PaymentService = require('../../services/payments/paymentService');
const rateLimit = require('express-rate-limit');

// Rate limiting: 60 requests per minute
const statusLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Too many requests, please try again later' }
});

router.get("/payment-status/:token", statusLimiter, async (req, res) => {
    try {
        console.log(`Checking payment status for token: ${req.params.token}`);
        const result = await PaymentService.getStatusByToken(req.params.token);
        res.json(result);
    } catch (error) {
        console.error("Payment status check error:", error);
        res.status(400).json({ 
            error: error.message || "Failed to check payment status" 
        });
    }
});

module.exports = router;