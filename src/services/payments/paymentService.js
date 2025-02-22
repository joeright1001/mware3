/**
 * Payment Service
 * --------------
 * Purpose: Handles payment status checking
 * Role: Provides business logic for payment status
 * 
 * Key Functions:
 * - Check payment status by token
 * 
 * Dependencies:
 * - Database pool for queries
 * 
 * Updates:
 * - Added Stripe payment support
 * - Maintains backward compatibility
 * - Returns all available payment options
 */

const pool = require('../../config/database');

class PaymentService {
    /**
     * Gets payment status and available payment URLs by token
     * Now includes Stripe payment URLs alongside existing providers
     * @param {string} token - Order token
     * @returns {Object} Payment status and available payment URLs
     */
    async getStatusByToken(token) {
        console.log('Checking payment status for token:', token);

        const query = `
            SELECT 
                p.payment_url,
                p.status,
                p.created_at,
                p.error_message,
                p.provider,
                p.expires_at
            FROM payments p
            JOIN orders o ON o.record_id = p.order_record_id
            WHERE o.token = $1
            AND p.status = 'success'
            AND (p.expires_at IS NULL OR p.expires_at > NOW())
            ORDER BY p.created_at DESC
        `;

        try {
            const result = await pool.query(query, [token]);
            console.log('Payment status results:', result.rows);

            // If no payment records found
            if (!result.rows.length) {
                return { 
                    status: 'pending',
                    message: 'Payment processing' 
                };
            }

            // Create an object to hold payment URLs for all providers
            const paymentUrls = {};
            
            // Process all successful payment records
            result.rows.forEach(row => {
                if (row.status === 'success' && row.payment_url) {
                    paymentUrls[row.provider] = {
                        payment_url: row.payment_url,
                        provider: row.provider,
                        expires_at: row.expires_at
                    };
                }
            });

            return {
                status: 'success',
                payments: paymentUrls,
                checked_at: new Date().toISOString()
            };

        } catch (error) {
            console.error('Database error in getStatusByToken:', error);
            throw new Error('Failed to check payment status');
        }
    }
}

module.exports = new PaymentService();