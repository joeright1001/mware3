require('dotenv').config();
const Queue = require('bull');

// Create a test queue
const testQueue = new Queue('test-queue', process.env.REDIS_URL);

// Add a test job
testQueue.add({ message: 'Test job' }, { delay: 5000 }); // 5 second delay

// Process jobs
testQueue.process(async (job) => {
    console.log('Processing job:', job.data.message);
    return { done: true };
});

// Listen for completed jobs
testQueue.on('completed', (job, result) => {
    console.log('Job completed with result:', result);
    process.exit(0);
});

console.log('Test started - waiting 5 seconds for job to process...');