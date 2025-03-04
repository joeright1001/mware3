/**
 * Payment Status Service
 * ---------------------
 * Purpose: Core business logic for payment status checking
 * 
 * Functions:
 * - Handle API requests for checking payment status
 * - Fetch pending payments that need status checks
 * - Route status checks to appropriate payment providers
 */

const pool = require('../../../config/database');
const poliPaymentStatus = require('./providers/poliPaymentStatus');
const stripePaymentStatus = require('./providers/stripePaymentStatus');
const alipayPaymentStatus = require('./providers/alipayPaymentStatus');
const btcpayPaymentStatus = require('./providers/btcpayPaymentStatus');
const blinkPaymentStatus = require('./providers/blinkPaymentStatus');

class PaymentStatusService {
    constructor() {
        // Map of payment providers to their status checking implementations
        this.providers = {
            'POLi': poliPaymentStatus,
            'STRIPE': stripePaymentStatus,
            'ALIPAY': alipayPaymentStatus,
            'BTCPAY': btcpayPaymentStatus,
            'BLINK': blinkPaymentStatus
        };
    }
    
    /**
     * Check status for a specific payment
     * Used by the API endpoint
     * @param {number} paymentId - Payment record ID
     * @returns {Object} Status check result
     */
    async checkPaymentStatus(paymentId) {
        try {
            // Get payment details
            const query = `
                SELECT record_id, payid, provider, status_pay
                FROM payments
                WHERE record_id = $1
            `;
            
            const result = await pool.query(query, [paymentId]);
            if (result.rows.length === 0) {
                throw new Error(`Payment not found: ${paymentId}`);
            }
            
            const payment = result.rows[0];
            if (!payment.payid) {
                throw new Error(`No payid for payment: ${paymentId}`);
            }
            
            // Get the appropriate provider implementation
            const providerImplementation = this.providers[payment.provider];
            if (!providerImplementation) {
                throw new Error(`No implementation for provider: ${payment.provider}`);
            }
            
            // Check the payment status
            const statusResult = await providerImplementation.checkStatus(payment.payid);
            
            // Log the status check result
            await this.logStatusCheck(payment.record_id, statusResult, statusResult.message);
            
            return {
                paymentId: payment.record_id,
                payid: payment.payid,
                provider: payment.provider,
                status: statusResult.status,
                payment_status: statusResult.payment_status || statusResult.status,
                message: statusResult.message
            };
        } catch (error) {
            console.error(`Error checking payment status for ID ${paymentId}:`, error);
            throw error;
        }
    }
    
    /**
     * Log a payment status check attempt to the pay_status table
     * @param {number} paymentId - Payment record ID
     * @param {Object} statusResult - Status result from provider
     * @param {string} message - Status message or error
     */
    async logStatusCheck(paymentId, statusResult, message) {
        try {
            // For providers that return both status types (dual-status):
            // - payment_status goes to pay_status.status
            // - status goes to payments.status_url
            // For single-status providers, use the same value for both
            
            const paymentStatus = statusResult.payment_status || statusResult.status;
            
            // Insert into pay_status table
            const query = `
                INSERT INTO pay_status (payments_record_id, date_time, status, message)
                VALUES ($1, NOW(), $2, $3)
            `;
            
            await pool.query(query, [paymentId, paymentStatus, message]);
            console.log(`Logged status check for payment ${paymentId}: ${paymentStatus}`);
            
            // Update the main payment record status
            if (statusResult.status) {
                await pool.query(
                    `UPDATE payments SET status_url = $1 WHERE record_id = $2`,
                    [statusResult.status, paymentId]
                );
                console.log(`Updated payment record ${paymentId} with status: ${statusResult.status}`);
            }
        } catch (error) {
            console.error(`Error logging status check for payment ${paymentId}:`, error);
            throw error;
        }
    }
}

module.exports = new PaymentStatusService();