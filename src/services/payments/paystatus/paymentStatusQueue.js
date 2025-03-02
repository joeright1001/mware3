/**
 * Payment Status Queue
 * -------------------
 * Purpose: Manages scheduled jobs for payment status checks
 * 
 * Functions:
 * - Schedule status checks at 1min and 3min after each payment (for testing)
 * - Process jobs for different payment providers
 * - Handle job failures and retries
 */

const Queue = require('bull');
// Import the providers directly to avoid circular dependency
const poliPaymentStatus = require('./providers/poliPaymentStatus');
const stripePaymentStatus = require('./providers/stripePaymentStatus');
const alipayPaymentStatus = require('./providers/alipayPaymentStatus');
const btcpayPaymentStatus = require('./providers/btcpayPaymentStatus');
const pool = require('../../../config/database');

// Create the payment status check queue
const paymentStatusQueue = new Queue('payment-status-checks', process.env.REDIS_URL, {
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: true,
        removeOnFail: 100 // Keep the last 100 failed jobs for inspection
    }
});

// Process jobs for checking payment statuses
paymentStatusQueue.process(async (job) => {
    console.log(`Processing payment status check job: ${job.id}`, job.data);
    
    const { paymentId, payid, provider, checkTime } = job.data;
    
    // Validate required parameters to prevent errors
    if (!paymentId || !payid) {
        console.error(`Invalid job data - missing required parameters: ${JSON.stringify(job.data)}`);
        throw new Error('Missing required payment data (paymentId or payid)');
    }
    
    try {
        // Use provider directly to avoid circular dependency
        let statusResult;
        
        if (provider === 'POLi') {
            // Check payment status using the POLi provider
            statusResult = await poliPaymentStatus.checkStatus(payid);
        } 
        else if (provider === 'STRIPE') {
            // Check payment status using the Stripe provider
            statusResult = await stripePaymentStatus.checkStatus(payid);
        }
        else if (provider === 'ALIPAY') {
            // Check payment status using the Alipay provider
            statusResult = await alipayPaymentStatus.checkStatus(payid);
        }
        else if (provider === 'BTCPAY') {
            // Check payment status using the BTCPay provider
            statusResult = await btcpayPaymentStatus.checkStatus(payid);
        }
        else {
            throw new Error(`Unsupported provider: ${provider}`);
        }
        
        // Log the status check to database
        await logStatusCheck(paymentId, statusResult.status, statusResult.message);
        
        const result = {
            paymentId,
            payid,
            provider,
            status: statusResult.status,
            message: statusResult.message
        };
        
        console.log(`Completed ${checkTime} status check for ${provider} payment ${payid}`);
        return result;
    } catch (error) {
        console.error(`Error processing payment status check for ${provider} payment ${payid}:`, error);
        
        // Try to log the error
        try {
            await logStatusCheck(paymentId, 'error', error.message);
        } catch (logError) {
            console.error(`Failed to log status check error: ${logError.message}`);
        }
        
        throw error; // Rethrow to trigger Bull's retry mechanism
    }
});

/**
 * Helper function to log a status check to the database
 * Defined directly in this file to avoid circular dependencies
 */
async function logStatusCheck(paymentId, status, message) {
    try {
        const query = `
            INSERT INTO pay_status (payments_record_id, date_time, status, message)
            VALUES ($1, NOW(), $2, $3)
        `;
        
        await pool.query(query, [paymentId, status, message]);
        console.log(`Logged status check for payment ${paymentId}: ${status}`);
    } catch (error) {
        console.error(`Error logging status check for payment ${paymentId}:`, error);
        throw error;
    }
}

/**
 * Schedule status checks for a specific payment
 * @param {Object} payment - Payment object with id, payid and provider
 */
function schedulePaymentStatusChecks(payment) {
    if (!payment || !payment.payid || !payment.record_id) {
        console.log('Cannot schedule status checks for payment - missing required data:', payment);
        return;
    }
    
    console.log(`Scheduling status checks for ${payment.provider} payment ${payment.payid}`);
    
    // Schedule first check at 1 minute after creation (for testing)
    paymentStatusQueue.add(
        {
            paymentId: payment.record_id,
            payid: payment.payid,
            provider: payment.provider,
            checkTime: '1min'
        },
        {
            delay: 1 * 60 * 1000, // 1 minute (for testing)
            jobId: `${payment.provider}-${payment.payid}-1min`
        }
    );
    
    // Schedule second check at 3 minutes after creation (for testing)
    paymentStatusQueue.add(
        {
            paymentId: payment.record_id,
            payid: payment.payid,
            provider: payment.provider,
            checkTime: '3min'
        },
        {
            delay: 3 * 60 * 1000, // 3 minutes (for testing)
            jobId: `${payment.provider}-${payment.payid}-3min`
        }
    );
    
    console.log(`Scheduled status checks for ${payment.provider} payment ${payment.payid} at +1min and +3min (testing)`);
}

// Event listeners for monitoring the queue
paymentStatusQueue.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed:`, {
        provider: job.data.provider,
        payid: job.data.payid,
        status: result?.status || 'unknown'
    });
});

paymentStatusQueue.on('failed', (job, error) => {
    console.error(`Job ${job.id} failed:`, {
        provider: job.data.provider,
        payid: job.data.payid,
        error: error.message
    });
});

// Clean up any existing repeatable jobs from previous implementations
async function cleanupOldRepeatingJobs() {
    try {
        // Get all repeatable jobs
        const repeatableJobs = await paymentStatusQueue.getRepeatableJobs();
        
        // Remove all repeatable jobs
        for (const job of repeatableJobs) {
            await paymentStatusQueue.removeRepeatableByKey(job.key);
            console.log(`Removed old repeatable job: ${job.key}`);
        }
        
        console.log('Old repeatable jobs cleanup completed');
    } catch (error) {
        console.error('Error cleaning up old repeatable jobs:', error);
    }
}

// Only run cleanup if environment variable isn't set to false
if (process.env.CLEANUP_PAYMENT_STATUS_QUEUE !== 'false') {
    cleanupOldRepeatingJobs();
    console.log('Old repeatable jobs cleanup completed');
} else {
    console.log('Job cleanup skipped (CLEANUP_PAYMENT_STATUS_QUEUE=false)');
}

module.exports = {
    paymentStatusQueue,
    schedulePaymentStatusChecks
};