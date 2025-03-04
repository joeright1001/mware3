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
// No need for separate Redis client, Bull uses ioredis internally

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
const redisLogger = logger.child({ component: 'redis' });

// Import configurations
const corsOptions = require('./src/config/cors');
const pool = require('./src/config/database');

// Import routes
const orderRoutes = require('./src/routes/public/orders');
const paymentRoutes = require('./src/routes/public/payments');
const adminRoutes = require('./src/routes/admin/dashboard');

// Debug: Log environment variables
systemLogger.info('Environment variables loaded', {
    PORT: process.env.PORT ? 'Set' : 'Not Set',
    DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Not Set',
    REDIS_URL: process.env.REDIS_URL ? 'Set' : 'Not Set',
    JWT_SECRET: process.env.JWT_SECRET ? 'Set' : 'Not Set',
    POLI_AUTH_CODE: process.env.POLI_AUTH_CODE ? 'Set' : 'Not Set',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? 'Set' : 'Not Set'
});

// Log Redis URL (securely)
if (process.env.REDIS_URL) {
    try {
        const redisURL = new URL(process.env.REDIS_URL);
        redisLogger.info(`Redis URL format check: protocol=${redisURL.protocol}, hostname=${redisURL.hostname}, port=${redisURL.port || 'default'}`);
    } catch (error) {
        redisLogger.error(`Invalid Redis URL format: ${error.message}`);
    }
}

// Import payment status queue
let paymentStatusQueue;
try {
    const queueModule = require('./src/services/payments/paystatus/paymentStatusQueue');
    paymentStatusQueue = queueModule.paymentStatusQueue;
    
    // Test queue connection
    if (paymentStatusQueue) {
        redisLogger.info('Payment status queue module loaded, testing connection...');
        
        // The queue's Redis client is available at paymentStatusQueue.client
        paymentStatusQueue.client.ping().then(response => {
            redisLogger.info(`Redis connection test: ${response}`);
        }).catch(error => {
            redisLogger.error('Redis connection test failed', { 
                error: error.message, 
                stack: error.stack 
            });
        });
    }
} catch (error) {
    redisLogger.error('Failed to initialize payment status queue', { 
        error: error.message,
        stack: error.stack
    });
}

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
    const health = { 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: 'unknown',
        redis: 'unknown',
        environment: process.env.NODE_ENV || 'development'
    };
    
    try {
        // Test database connection
        await pool.query('SELECT NOW()');
        health.database = 'connected';
    } catch (error) {
        health.database = 'disconnected';
        health.status = 'error';
        logger.error('Health check database error:', error);
    }
    
    // Test Redis connection using Bull's redis client if available
    if (paymentStatusQueue) {
        try {
            const pingResult = await paymentStatusQueue.client.ping();
            health.redis = pingResult === 'PONG' ? 'connected' : 'error';
        } catch (error) {
            health.redis = 'disconnected';
            health.status = 'error';
            logger.error('Health check Redis error:', error);
        }
    } else {
        health.redis = 'not initialized';
        health.status = 'error';
    }
    
    const statusCode = health.status === 'ok' ? 200 : 500;
    res.status(statusCode).json(health);
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
  systemLogger,
  redisLogger
};

// CRITICAL: Create server this way to handle shutdown
const server = app.listen(PORT, () => {
    systemLogger.info(`Server started on port ${PORT}`);
    if (paymentStatusQueue) {
        paymentLogger.info(`Payment status checking service initialized`);
    } else {
        paymentLogger.warn(`Payment status checking service failed to initialize - check Redis connection`);
    }
});

// Graceful Shutdown Handler
function gracefulShutdown() {
    systemLogger.info('Received kill signal, shutting down gracefully');
    
    // First close the server
    server.close(async () => {
        systemLogger.info('Closed out remaining connections');
        
        // Then close the payment status queue
        try {
            if (paymentStatusQueue) {
                await paymentStatusQueue.close();
                paymentLogger.info('Payment status queue closed');
            }
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