
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
 * - Modified query to prioritize successful payments
 * - Added provider information to response
 * - Maintains backward compatibility with existing features
 */

const pool = require('../../config/database');

class PaymentService {
    async getStatusByToken(token) {
        console.log('Checking payment status for token:', token);

        const query = `
            SELECT 
                p.payment_url,
                p.status,
                p.created_at,
                p.error_message,
                p.provider
            FROM payments p
            JOIN orders o ON o.record_id = p.order_record_id
            WHERE o.token = $1
            ORDER BY 
                p.status = 'success' DESC, -- Prioritize successful payments
                p.created_at DESC          -- Then by most recent
            LIMIT 1
        `;

        try {
            const result = await pool.query(query, [token]);
            console.log('Payment status result:', result.rows[0]);

            // If no payment record found
            if (!result.rows[0]) {
                return { 
                    status: 'pending',
                    message: 'Payment processing' 
                };
            }

            return {
                status: result.rows[0].status,
                payment_url: result.rows[0].payment_url,
                error_message: result.rows[0].error_message,
                provider: result.rows[0].provider,
                checked_at: new Date().toISOString()
            };

        } catch (error) {
            console.error('Database error in getStatusByToken:', error);
            throw new Error('Failed to check payment status');
        }
    }
}

module.exports = new PaymentService();
