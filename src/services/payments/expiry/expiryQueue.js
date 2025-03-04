const Queue = require('bull');

const expiryQueue = new Queue('payment-expiry', process.env.REDIS_URL, {
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000 // 1 second initial delay
        }
    }
});

// Log events for monitoring
expiryQueue.on('completed', job => {
    console.log(`Payment expiry job completed: ${job.id} for ${job.data.provider} payment ${job.data.payid}`);
});

expiryQueue.on('failed', (job, error) => {
    console.error(`Payment expiry job failed: ${job.id} for ${job.data.provider} payment ${job.data.payid}`, error);
});

module.exports = expiryQueue;