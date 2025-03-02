// src/routes/admin/dashboard.js
const express = require('express');
const router = express.Router(); // This line is missing in your file
const pool = require('../../config/database');
const basicAuth = require('express-basic-auth');

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
    const status = req.query.status || '';
    const provider = req.query.provider || '';
    
    // Build query with filters
    let query = `
      SELECT p.*, o.trade_order, o.first_name_order, o.email_order
      FROM payments p
      LEFT JOIN orders o ON p.order_record_id = o.record_id
      WHERE 1=1
    `;
    const params = [];
    
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (o.trade_order ILIKE $${params.length} OR o.email_order ILIKE $${params.length})`;
    }
    
    if (status) {
      params.push(status);
      query += ` AND p.status_pay = $${params.length}`;
    }
    
    if (provider) {
      params.push(provider);
      query += ` AND p.provider = $${params.length}`;
    }
    
    // Add sorting and pagination
    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    // Count total for pagination
    const countQuery = query.replace('SELECT p.*, o.trade_order, o.first_name_order, o.email_order', 'SELECT COUNT(*)').split('ORDER BY')[0];
    
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
      status,
      provider,
      query: req.query
    });
  } catch (error) {
    console.error('Error fetching payments for admin dashboard:', error);
    res.status(500).render('admin/error', { error: 'Failed to load payment data: ' + error.message });
  }
});

module.exports = router;