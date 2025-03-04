/**
 * Public PDF Routes
 * ----------------
 * Purpose: Provides endpoints for accessing order PDFs
 * 
 * Available Endpoints:
 * - GET /pdf/:tradeOrder - Download PDF for a specific order
 * 
 * Security Features:
 * - Rate limiting to prevent abuse
 * - PDF access restricted to valid trade order numbers
 * 
 * Dependencies:
 * - PDF Service for retrieval
 * - Express for routing
 */

const express = require('express');
const router = express.Router();
const pdfService = require('../../services/pdf/pdfService');
const rateLimit = require('express-rate-limit');

// Rate limiting: 60 requests per minute
const pdfLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, please try again later' }
});

// Download PDF for an order
router.get("/:tradeOrder", pdfLimiter, async (req, res) => {
  try {
    const tradeOrder = req.params.tradeOrder;
    const pdf = await pdfService.getPdfByTradeOrder(tradeOrder);
    
    if (!pdf) {
      return res.status(404).json({ 
        error: "PDF not found. It may still be generating or the order doesn't exist." 
      });
    }
    
    // Check if PDF is still processing
    if (pdf.status === 'processing') {
      return res.status(202).json({
        status: 'processing',
        message: 'PDF is still being generated. Please try again later.'
      });
    }
    
    // Check if PDF generation failed
    if (pdf.status === 'failed') {
      return res.status(500).json({
        status: 'failed',
        message: 'PDF generation failed.',
        error: pdf.error_message || 'Unknown error'
      });
    }
    
    // Send PDF as download
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      'Content-Length': pdf.pdf_data.length
    });
    
    res.send(pdf.pdf_data);
  } catch (error) {
    console.error("Error retrieving PDF:", error);
    res.status(500).json({ error: "Failed to retrieve PDF" });
  }
});

module.exports = router;