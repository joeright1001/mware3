/**
 * Admin PDF Routes
 * ---------------
 * Purpose: Provides PDF management endpoints for administrators
 * 
 * Available Endpoints:
 * - GET /admin/pdf/:pdfId/view - View PDF in browser
 * - GET /admin/pdf/:pdfId/download - Download PDF
 * 
 * Security Features:
 * - Authentication required for all endpoints
 * - PDF access restricted to admin users
 * 
 * Dependencies:
 * - PDF Service for retrieval
 * - Express for routing
 * - Basic Auth for authentication
 */

const express = require('express');
const router = express.Router();
const pdfService = require('../../services/pdf/pdfService');
const basicAuth = require('express-basic-auth');

// Authentication middleware
const adminAuth = basicAuth({
  users: { 
    'admin': process.env.ADMIN_PASSWORD || 'changeme'
  },
  challenge: true,
  realm: 'Payment Admin Dashboard'
});

// View PDF in browser
router.get("/:pdfId/view", adminAuth, async (req, res) => {
  try {
    const pdfId = req.params.pdfId;
    const pdf = await pdfService.getPdfById(pdfId);
    
    if (!pdf) {
      return res.status(404).render('admin/error', { error: 'PDF not found' });
    }
    
    // Check if PDF is still processing
    if (pdf.status === 'processing') {
      return res.render('admin/pdf-status', {
        status: 'processing',
        message: 'PDF is still being generated. Please try again later.',
        tradeOrder: pdf.trade_order
      });
    }
    
    // Check if PDF generation failed
    if (pdf.status === 'failed') {
      return res.render('admin/pdf-status', {
        status: 'failed',
        message: 'PDF generation failed.',
        error: pdf.error_message || 'Unknown error',
        tradeOrder: pdf.trade_order
      });
    }
    
    // Send PDF for inline viewing
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdf.filename}"`,
      'Content-Length': pdf.pdf_data.length
    });
    
    res.send(pdf.pdf_data);
  } catch (error) {
    console.error("Error retrieving PDF for viewing:", error);
    res.status(500).render('admin/error', { error: 'Failed to retrieve PDF: ' + error.message });
  }
});

// Download PDF
router.get("/:pdfId/download", adminAuth, async (req, res) => {
  try {
    const pdfId = req.params.pdfId;
    const pdf = await pdfService.getPdfById(pdfId);
    
    if (!pdf) {
      return res.status(404).render('admin/error', { error: 'PDF not found' });
    }
    
    // Check if PDF is still processing
    if (pdf.status === 'processing') {
      return res.render('admin/pdf-status', {
        status: 'processing',
        message: 'PDF is still being generated. Please try again later.',
        tradeOrder: pdf.trade_order
      });
    }
    
    // Check if PDF generation failed
    if (pdf.status === 'failed') {
      return res.render('admin/pdf-status', {
        status: 'failed',
        message: 'PDF generation failed.',
        error: pdf.error_message || 'Unknown error',
        tradeOrder: pdf.trade_order
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
    console.error("Error downloading PDF:", error);
    res.status(500).render('admin/error', { error: 'Failed to download PDF: ' + error.message });
  }
});

module.exports = router;