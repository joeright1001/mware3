const pool = require('../../config/database');
const expiryQueue = require('./expiryQueue');
const blinkExpiry = require('./providers/blinkExpiry');
const blinkService = require('../payments/blinkService'); // Changed to use instance

class PaymentExpiryService {
    constructor() {
        this.setupQueueProcessor();
    }

    setupQueueProcessor() {
        expiryQueue.process(async (job) => {
            const { payid, provider } = job.data;
            console.log(`Processing expiry for ${provider} payment ${payid}`);
            
            try {
                await this.processExpiry(payid, provider);
                return { success: true, payid, provider };
            } catch (error) {
                // Check if error is due to payment already being expired or invalid
                if (error.response?.status === 404 || error.response?.status === 410) {
                    console.log(`Payment ${payid} already expired or invalid`);
                    await this.updatePaymentStatus(payid, 'expired', 'Payment already expired');
                    return { success: true, payid, provider, status: 'already_expired' };
                }

                console.error(`Expiry processing failed for ${payid}:`, error);
                throw error;
            }
        });
    }

    async updatePaymentStatus(payid, status, message) {
        const client = await pool.connect();
        try {
            await client.query(
                `UPDATE payments 
                 SET status = $1, 
                     error_message = $2
                 WHERE payid = $3`,
                [status, message, payid]
            );
        } finally {
            client.release();
        }
    }

    async processExpiry(payid, provider) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Get payment details
            const { rows } = await client.query(
                'SELECT * FROM payments WHERE payid = $1 AND provider = $2',
                [payid, provider]
            );

            if (!rows.length) {
                throw new Error(`Payment ${payid} not found`);
            }

            const payment = rows[0];

            // Only process if payment is still active
            if (payment.status === 'success') {
                // Handle provider-specific revocation
                switch (provider) {
                    case 'BLINK':
                        const token = await blinkService.ensureValidToken();
                        await blinkExpiry.revokePayment(payid, token);
                        break;
                    default:
                        throw new Error(`Unsupported payment provider: ${provider}`);
                }

                // Update payment status
                await client.query(
                    `UPDATE payments 
                     SET status = 'expired', 
                         error_message = 'Payment link expired'
                     WHERE payid = $1`,
                    [payid]
                );

                console.log(`Successfully expired ${provider} payment ${payid}`);
            } else {
                console.log(`Payment ${payid} already in ${payment.status} status, skipping expiry`);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async scheduleExpiry(payid, provider) {
        // Set expiry slightly shorter than Blink's expiry to ensure we revoke first
        const expiryMinutes = (parseInt(process.env.BLINK_PAYMENT_EXPIRY_MINUTES) || 30) - 2;
        
        console.log(`Scheduling expiry for ${provider} payment ${payid} in ${expiryMinutes} minutes`);
        
        // Schedule job
        await expiryQueue.add(
            { payid, provider },
            { 
                delay: expiryMinutes * 60 * 1000,
                jobId: `${provider}-${payid}`,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000
                }
            }
        );

        console.log(`Expiry scheduled for ${provider} payment ${payid}`);
    }
}

module.exports = new PaymentExpiryService();