/**
 * Main Application Entry Point with Streamlined Logging
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require('path');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const fs = require('fs');

// Create directory for logs if it doesn't exist
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Configure Winston logger with custom formats
const consoleFormat = winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
  // For website activity, create a minimal format
  if (meta.isWebRequest) {
    return `${timestamp} [${level}] ${meta.method} ${meta.url} ${meta.status} ${meta.duration}ms`;
  }
  
  // For regular logs, use a more readable format
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const comp = component ? `[${component}] ` : '';
  return `${timestamp} ${comp}${level}: ${message}${metaStr}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true })
  ),
  defaultMeta: { service: 'payment-server' },
  transports: [
    // Console output with custom formatting
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        consoleFormat
      )
    }),
    // Log files with JSON for later analysis
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      format: winston.format.combine(
        winston.format.json()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      format: winston.format.combine(
        winston.format.json()
      )
    })
  ]
});

// IMPORTANT: Replace console methods but DON'T double log
// This completely replaces the standard console functions
console.log = function(...args) {
  logger.info(args.join(' '));
};

console.error = function(...args) {
  logger.error(args.join(' '));
};

console.warn = function(...args) {
  logger.warn(args.join(' '));
};

console.info = function(...args) {
  logger.info(args.join(' '));
};

// Create specialized loggers for different components
const orderLogger = logger.child({ component: 'orders' });
const paymentLogger = logger.child({ component: 'payments' });
const adminLogger = logger.child({ component: 'admin' });
const systemLogger = logger.child({ component: 'system' });

// Import configurations
const corsOptions = require('./src/config/cors');
const pool = require('./src/config/database');

// Import routes
const orderRoutes = require('./src/routes/public/orders');
const paymentRoutes = require('./src/routes/public/payments');
const adminRoutes = require('./src/routes/admin/dashboard');

// Import payment status queue
const { paymentStatusQueue } = require('./src/services/payments/paystatus/paymentStatusQueue');

// Debug: Log environment variables
systemLogger.info('Environment variables loaded', {
    PORT: process.env.PORT ? 'Set' : 'Not Set',
    DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Not Set',
    JWT_SECRET: process.env.JWT_SECRET ? 'Set' : 'Not Set',
    POLI_AUTH_CODE: process.env.POLI_AUTH_CODE ? 'Set' : 'Not Set',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? 'Set' : 'Not Set'
});

const app = express();

// Trust proxy setting for rate limiting (important for Railway)
app.set('trust proxy', 1);

// Set up templating engine for admin dashboard
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

systemLogger.info('Middleware initialized');

// Add request logging middleware with streamlined output
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Only log with a simplified format for normal requests, more detail for errors
    if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`, {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: duration,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    } else {
      // Use our custom format for web requests
      logger.info(`Web request processed`, {
        isWebRequest: true,
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: duration
      });
    }
  });
  next();
});

// Admin route rate limiting
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Routes
app.use("/", orderRoutes);          // Base URL for order routes
app.use("/api", paymentRoutes);     // Payment status endpoint
app.use('/admin', adminLimiter, adminRoutes); // Admin dashboard routes

// Enhanced health check endpoint with database status
app.get('/health', async (req, res) => {
    try {
        // Test database connection
        await pool.query('SELECT NOW()');
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            database: 'connected',
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        console.error('Health check database error:', error);
        res.status(500).json({ 
            status: 'error', 
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            environment: process.env.NODE_ENV || 'development'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Global error encountered', { 
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method
    });
    res.status(500).json({ error: "Server error" });
});

// ⚠️ CONFIGURE: Server port
const PORT = process.env.PORT || 3000;

// Export loggers so they can be used in other modules
module.exports = {
  logger,
  orderLogger,
  paymentLogger,
  adminLogger,
  systemLogger
};

// CRITICAL: Create server this way to handle shutdown
const server = app.listen(PORT, () => {
    systemLogger.info(`Server started on port ${PORT}`);
    paymentLogger.info(`Payment status checking service initialized`);
});

// Graceful Shutdown Handler
function gracefulShutdown() {
    systemLogger.info('Received kill signal, shutting down gracefully');
    
    // First close the server
    server.close(async () => {
        systemLogger.info('Closed out remaining connections');
        
        // Then close the payment status queue
        try {
            await paymentStatusQueue.close();
            paymentLogger.info('Payment status queue closed');
        } catch (err) {
            logger.error('Error closing payment status queue', { error: err.message });
        }
        
        process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason: reason.toString() });
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.toString(), stack: error.stack });
  // Give the logger time to log the error before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Add basic health check endpoint
app.get('/health', (req, res) => {
    const timestamp = new Date().toISOString();
    res.json({ status: 'ok', timestamp });
});