// src/routes/admin/dashboard.js
const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const basicAuth = require('express-basic-auth');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');
const pdfService = require('../../services/pdf/pdfService');

// Authentication middleware
const adminAuth = basicAuth({
  users: { 
    'admin': process.env.ADMIN_PASSWORD || 'changeme'
  },
  challenge: true,
  realm: 'Payment Admin Dashboard'
});

// Admin dashboard route with authentication
router.get('/payments', adminAuth, async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    // Search/filter parameters
    const search = req.query.search || '';
    const searchTO = req.query.searchTO || '';
    const provider = req.query.provider || '';
    
    // Get status filters from query params - both types of status
    const statusPayFilter = Array.isArray(req.query.statusPayFilter) 
      ? req.query.statusPayFilter 
      : req.query.statusPayFilter ? [req.query.statusPayFilter] : [];
      
    const statusUrlFilter = Array.isArray(req.query.statusUrlFilter) 
      ? req.query.statusUrlFilter 
      : req.query.statusUrlFilter ? [req.query.statusUrlFilter] : [];
    
    // Additional status filters for expired, unused and reviewed
    const showExpired = req.query.showExpired === 'on';
    const showUnused = req.query.showUnused === 'on';
    const reviewedFilter = req.query.reviewedFilter || 'all'; // 'all', 'yes', 'no'
    
    // Build query with filters
    let query = `
      SELECT p.*, o.trade_order, o.first_name_order, o.last_name_order, o.email_order, o.phone_order
      FROM payments p
      LEFT JOIN orders o ON p.order_record_id = o.record_id
      WHERE 1=1
    `;
    const params = [];
    
    // Regular search (email, phone)
    if (search) {
      params.push(`%${search}%`);
      params.push(`%${search}%`);
      query += ` AND (o.email_order ILIKE $${params.length-1} OR o.phone_order ILIKE $${params.length})`;
    }
    
    // Specific TO search
    if (searchTO) {
      params.push(`%${searchTO}%`);
      query += ` AND o.trade_order ILIKE $${params.length}`;
    }
    
    // Apply status_pay filters if provided
    if (statusPayFilter.length > 0) {
      const statusPlaceholders = statusPayFilter.map((_, index) => `$${params.length + index + 1}`).join(',');
      query += ` AND p.status_pay IN (${statusPlaceholders})`;
      params.push(...statusPayFilter);
    }
    
    // Apply status_url filters if provided
    if (statusUrlFilter.length > 0) {
      const urlStatusPlaceholders = statusUrlFilter.map((_, index) => `$${params.length + index + 1}`).join(',');
      query += ` AND p.status_url IN (${urlStatusPlaceholders})`;
      params.push(...statusUrlFilter);
    }
    
    if (provider) {
      params.push(provider);
      query += ` AND p.provider = $${params.length}`;
    }
    
    // Add expiry filter
    if (showExpired) {
      query += ` AND (p.expires_at < NOW() OR p.status_expiry = 'expired')`;
    }
    
    // Add unused filter (no status or pending status with no expiry)
    if (showUnused) {
      query += ` AND (p.status_pay IS NULL OR (p.status_pay = 'pending' AND p.status_expiry IS NULL))`;
    }
    
    // Add reviewed filter
    if (reviewedFilter === 'yes') {
      query += ` AND (p.reviewed = 'yes' OR p.reviewed = 'Yes')`;
    } else if (reviewedFilter === 'no') {
      query += ` AND (p.reviewed IS NULL OR p.reviewed = 'no' OR p.reviewed = 'No')`;
    }
    
    // Add sorting and pagination
    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    // Count total for pagination
    const countQuery = query.replace('SELECT p.*, o.trade_order, o.first_name_order, o.last_name_order, o.email_order, o.phone_order', 'SELECT COUNT(*)').split('ORDER BY')[0];
    
    // Execute queries
    console.log('Executing queries...');
    
    const [payments, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2))
    ]);
    
    const totalPayments = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalPayments / limit);
    
    console.log(`Found ${payments.rows.length} payments of ${totalPayments} total`);
    
    // Render the admin dashboard with data
    res.render('admin/payments', {
      payments: payments.rows,
      page,
      limit,
      totalPages,
      totalPayments,
      search,
      searchTO,
      statusPayFilter,
      statusUrlFilter,
      provider,
      showExpired,
      showUnused,
      reviewedFilter
    });
  } catch (error) {
    console.error('Error fetching payments for admin dashboard:', error);
    res.status(500).render('admin/error', { error: 'Failed to load payment data: ' + error.message });
  }
});

// Export CSV data route
router.get('/export-csv', adminAuth, async (req, res) => {
  try {
    const startDate = req.query.startDate || '';
    const endDate = req.query.endDate || '';
    
    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Start date and end date are required' 
      });
    }
    
    // Build query with date range
    const query = `
      SELECT 
        p.record_id AS payment_id,
        p.created_at AS payment_date,
        p.provider,
        p.amount,
        p.status_pay,
        p.status_url,
        p.reviewed,
        p.status_expiry,
        p.expires_at,
        p.payment_url,
        p.payid,
        o.record_id AS order_id,
        o.trade_order,
        o.first_name_order,
        o.last_name_order,
        o.email_order,
        o.phone_order,
        o.product_name_full,
        o.total_price,
        o.quantity,
        o.price_nzd,
        o.address,
        o.message,
        o.order_creation_time
      FROM payments p
      LEFT JOIN orders o ON p.order_record_id = o.record_id
      WHERE p.created_at BETWEEN $1 AND $2
      ORDER BY p.created_at DESC
    `;
    
    // Execute the query with the date range
    const formattedStartDate = new Date(startDate);
    const formattedEndDate = new Date(endDate);
    formattedEndDate.setHours(23, 59, 59, 999); // Set to end of day
    
    const result = await pool.query(query, [formattedStartDate, formattedEndDate]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No data found for the selected date range'
      });
    }
    
    // Setup CSV fields
    const fields = [
      { label: 'Payment ID', value: 'payment_id' },
      { label: 'Payment Date', value: row => new Date(row.payment_date).toLocaleString() },
      { label: 'Provider', value: 'provider' },
      { label: 'Amount', value: 'amount' },
      { label: 'Payment Status', value: 'status_pay' },
      { label: 'URL Status', value: 'status_url' },
      { label: 'Reviewed', value: 'reviewed' },
      { label: 'Expiry Status', value: 'status_expiry' },
      { label: 'Order ID', value: 'order_id' },
      { label: 'Order Number', value: 'trade_order' },
      { label: 'First Name', value: 'first_name_order' },
      { label: 'Last Name', value: 'last_name_order' },
      { label: 'Email', value: 'email_order' },
      { label: 'Phone', value: 'phone_order' },
      { label: 'Product', value: 'product_name_full' },
      { label: 'Quantity', value: 'quantity' },
      { label: 'Order Total', value: 'total_price' },
      { label: 'Address', value: 'address' },
      { label: 'Message', value: 'message' },
      { label: 'Order Date', value: row => row.order_creation_time ? new Date(row.order_creation_time).toLocaleString() : '' },
      { label: 'Payment URL', value: 'payment_url' }
    ];
    
    // Generate CSV
    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(result.rows);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payments_${startDate}_to_${endDate}.csv`);
    
    // Send the CSV data
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to export data: ' + error.message 
    });
  }
});

// Order details view - fixed to handle both numeric IDs and "TO-xxxx" format
router.get('/order/:orderId', adminAuth, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    let orderResult;
    
    if (orderId.startsWith('TO-')) {
      // If it's a TO-xxxx format, search by trade_order
      orderResult = await pool.query(
        `SELECT * FROM orders WHERE trade_order = $1`, 
        [orderId]
      );
    } else {
      // Otherwise assume it's a numeric record_id
      const recordId = parseInt(orderId, 10);
      if (isNaN(recordId)) {
        return res.status(400).render('admin/error', { error: 'Invalid order ID format' });
      }
      
      orderResult = await pool.query(
        `SELECT * FROM orders WHERE record_id = $1`, 
        [recordId]
      );
    }
    
    if (orderResult.rows.length === 0) {
      return res.status(404).render('admin/error', { error: 'Order not found' });
    }
    
    // Get payments for this order
    const paymentResult = await pool.query(
      `SELECT * FROM payments WHERE order_record_id = $1 ORDER BY created_at DESC`,
      [orderResult.rows[0].record_id]
    );
    
    // Get PDF status for this order
    let pdfStatus = null;
    try {
      pdfStatus = await pdfService.getPdfStatus(orderResult.rows[0].trade_order);
    } catch (error) {
      console.error('Error fetching PDF status:', error);
    }
    
    res.render('admin/order-details', {
      order: orderResult.rows[0],
      payments: paymentResult.rows,
      pdfStatus: pdfStatus
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('admin/error', { error: 'Failed to load order details: ' + error.message });
  }
});

// API endpoint to mark payment as reviewed
router.post('/api/mark-reviewed/:paymentId', adminAuth, async (req, res) => {
  try {
    const paymentId = req.params.paymentId;
    
    console.log(`Marking payment ID ${paymentId} as reviewed`);
    
    // Update the reviewed column
    await pool.query(
      `UPDATE payments SET reviewed = 'yes' WHERE record_id = $1`, 
      [paymentId]
    );
    
    res.json({
      success: true,
      message: 'Payment marked as reviewed'
    });
  } catch (error) {
    console.error('Error marking payment as reviewed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint for AJAX data refresh
router.get('/payments/data', adminAuth, async (req, res) => {
  try {
    // Check if we're requesting a single payment
    const singlePaymentId = req.query.singlePaymentId ? parseInt(req.query.singlePaymentId) : null;
    
    // If we're requesting a single payment by ID
    if (singlePaymentId) {
      const result = await pool.query(
        `SELECT p.*, o.trade_order, o.first_name_order, o.last_name_order, o.email_order, o.phone_order
         FROM payments p
         LEFT JOIN orders o ON p.order_record_id = o.record_id
         WHERE p.record_id = $1`,
        [singlePaymentId]
      );
      
      return res.json({
        success: true,
        payments: result.rows
      });
    }
    
    // Regular data refresh
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const searchTO = req.query.searchTO || '';
    const provider = req.query.provider || '';
    
    // Get status filters from query params - both types of status
    const statusPayFilter = Array.isArray(req.query.statusPayFilter) 
      ? req.query.statusPayFilter 
      : req.query.statusPayFilter ? [req.query.statusPayFilter] : [];
      
    const statusUrlFilter = Array.isArray(req.query.statusUrlFilter) 
      ? req.query.statusUrlFilter 
      : req.query.statusUrlFilter ? [req.query.statusUrlFilter] : [];
    
    // Additional status filters for expired, unused and reviewed
    const showExpired = req.query.showExpired === 'on';
    const showUnused = req.query.showUnused === 'on';
    const reviewedFilter = req.query.reviewedFilter || 'all';
    
    // Query for the latest payments matching filters
    let query = `
      SELECT p.*, o.trade_order, o.first_name_order, o.last_name_order, o.email_order, o.phone_order
      FROM payments p
      LEFT JOIN orders o ON p.order_record_id = o.record_id
      WHERE 1=1
    `;
    const params = [];
    
    // Regular search (email, phone)
    if (search) {
      params.push(`%${search}%`);
      params.push(`%${search}%`);
      query += ` AND (o.email_order ILIKE $${params.length-1} OR o.phone_order ILIKE $${params.length})`;
    }
    
    // Specific TO search
    if (searchTO) {
      params.push(`%${searchTO}%`);
      query += ` AND o.trade_order ILIKE $${params.length}`;
    }
    
    // Apply status_pay filters if provided
    if (statusPayFilter.length > 0) {
      const statusPlaceholders = statusPayFilter.map((_, index) => `$${params.length + index + 1}`).join(',');
      query += ` AND p.status_pay IN (${statusPlaceholders})`;
      params.push(...statusPayFilter);
    }
    
    // Apply status_url filters if provided
    if (statusUrlFilter.length > 0) {
      const urlStatusPlaceholders = statusUrlFilter.map((_, index) => `$${params.length + index + 1}`).join(',');
      query += ` AND p.status_url IN (${urlStatusPlaceholders})`;
      params.push(...statusUrlFilter);
    }
    
    if (provider) {
      params.push(provider);
      query += ` AND p.provider = $${params.length}`;
    }
    
    // Add expiry filter
    if (showExpired) {
      query += ` AND (p.expires_at < NOW() OR p.status_expiry = 'expired')`;
    }
    
    // Add unused filter
    if (showUnused) {
      query += ` AND (p.status_pay IS NULL OR (p.status_pay = 'pending' AND p.status_expiry IS NULL))`;
    }
    
    // Add reviewed filter
    if (reviewedFilter === 'yes') {
      query += ` AND (p.reviewed = 'yes' OR p.reviewed = 'Yes')`;
    } else if (reviewedFilter === 'no') {
      query += ` AND (p.reviewed IS NULL OR p.reviewed = 'no' OR p.reviewed = 'No')`;
    }
    
    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      payments: result.rows
    });
  } catch (error) {
    console.error('Error fetching payments data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;