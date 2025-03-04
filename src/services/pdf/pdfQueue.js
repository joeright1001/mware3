/**
 * PDF Generation Queue Service
 * ---------------------------
 * Purpose: Manages the queue for PDF generation
 * 
 * Core Functionality:
 * - Creates a separate queue for PDF generation tasks
 * - Schedules PDF generation after order creation (with delay)
 * - Processes PDF generation asynchronously
 * - Handles retries for failed generation attempts
 * - Maintains one-to-one relationship between orders and PDFs
 * 
 * Design Philosophy:
 * - Non-blocking PDF generation separate from order processing
 * - Resilient to failures with automatic retries
 * - Minimizes resource contention with other services
 * 
 * Dependencies:
 * - Bull for queue management
 * - Redis for queue storage
 * - PDF Service for actual generation
 */

const Queue = require('bull');
const pdfService = require('./pdfService');

// Create the PDF generation queue
const pdfQueue = new Queue('pdf-generation', process.env.REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000 // 5 seconds initial delay
    },
    removeOnComplete: true,
    removeOnFail: 100 // Keep the last 100 failed jobs for inspection
  }
});

// Process PDF generation jobs
pdfQueue.process(async (job) => {
  const { tradeOrder } = job.data;
  console.log(`Processing PDF generation job for order: ${tradeOrder}`);
  
  try {
    // Generate PDF
    const result = await pdfService.generateOrderPDF(tradeOrder);
    
    console.log(`PDF generation job completed for order: ${tradeOrder}`);
    return result;
  } catch (error) {
    console.error(`PDF generation job failed for order: ${tradeOrder}:`, error);
    throw error; // Rethrow to trigger Bull's retry mechanism
  }
});

/**
 * Schedule a PDF generation job for a specific order
 * @param {string} tradeOrder - Trade order number (TO-XXXX)
 * @param {number} delaySeconds - Delay in seconds before processing the job (default: 60)
 * @returns {Object} Job information
 */
async function schedulePdfGeneration(tradeOrder, delaySeconds = 60) {
  console.log(`Scheduling PDF generation for order: ${tradeOrder} with ${delaySeconds}s delay`);
  
  // Ensure the pdforder table exists
  await pdfService.ensurePdfOrderTableExists();
  
  // Add job to queue
  const job = await pdfQueue.add(
    { tradeOrder },
    { 
      delay: delaySeconds * 1000,
      jobId: `pdf-${tradeOrder}-${Date.now()}`  // Unique job ID
    }
  );
  
  console.log(`PDF generation scheduled for order: ${tradeOrder}, job ID: ${job.id}`);
  return {
    success: true,
    jobId: job.id,
    tradeOrder
  };
}

// Event listeners for monitoring the queue
pdfQueue.on('completed', (job, result) => {
  console.log(`PDF job ${job.id} completed for order: ${result.tradeOrder}`);
});

pdfQueue.on('failed', (job, error) => {
  console.error(`PDF job ${job.id} failed for order: ${job.data.tradeOrder}:`, error.message);
});

module.exports = {
  pdfQueue,
  schedulePdfGeneration
};