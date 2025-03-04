/**
 * PDF Generation Service
 * ---------------------
 * Purpose: Handles PDF generation for order confirmations
 * 
 * Core Functionality:
 * - Renders Webflow PDF page using puppeteer
 * - Injects order data directly into DOM elements
 * - Populates payment buttons with payment links
 * - Generates PDF files from rendered pages
 * - Stores PDFs in PostgreSQL database
 * - Provides retrieval methods for PDF access
 * 
 * Design Philosophy:
 * - One-to-one relationship between orders and PDFs
 * - Direct DOM manipulation for reliable data injection
 * - PostgreSQL storage for both development and production
 * - Error handling and logging throughout the process
 * 
 * Dependencies:
 * - puppeteer for headless browser automation
 * - PostgreSQL database for PDF storage
 */

const puppeteer = require('puppeteer');
const pool = require('../../config/database');

class PDFService {
  /**
   * Generate PDF for a specific order
   * @param {string} tradeOrder - The trade order number (TO-XXXX)
   * @returns {Object} PDF generation result with file info
   */
  async generateOrderPDF(tradeOrder) {
    console.log(`Starting PDF generation for order: ${tradeOrder}`);
    
    let browser = null;
    
    try {
      // 1. Retrieve complete order data from database
      const orderData = await this.getOrderDataForPdf(tradeOrder);
      
      // 2. Check if PDF already exists for this order
      const existingPdf = await this.checkExistingPdf(tradeOrder);
      if (existingPdf) {
        console.log(`PDF already exists for order ${tradeOrder}, skipping generation`);
        return {
          success: true,
          pdfId: existingPdf.record_id,
          message: 'PDF already exists',
          alreadyExists: true
        };
      }
      
      // 3. Update status to processing
      await this.updatePdfStatus(orderData.record_id, tradeOrder, 'processing');
      
      // 4. Retrieve payment links for the order
      const paymentLinks = await this.getPaymentLinks(orderData.record_id);
      console.log(`Retrieved ${Object.keys(paymentLinks).length} payment links for order: ${tradeOrder}`);
      
      // 5. Launch browser with detailed logging
      console.log('Launching browser...');
      browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: 'new'  // Use new headless mode
      });
      console.log('Browser launched successfully');
      
      console.log('Creating new page...');
      const page = await browser.newPage();
      console.log('Page created successfully');
      
      // 6. Navigate to Webflow page
      console.log(`Navigating to PDF order page for: ${tradeOrder}`);
      await page.goto('https://gold-buyers-christchurch-test.webflow.io/pdf-order', {
        waitUntil: 'networkidle0'  // Wait until page is fully loaded
      });
      console.log('Page loaded successfully');
      
      // 7. Inject order data directly into DOM
      console.log(`Injecting order data for: ${tradeOrder} using DOM manipulation`);
      await this.injectOrderDataToDom(page, orderData);
      console.log('Data injection completed');
      
      // 8. Inject payment links into buttons
      console.log('Injecting payment links into buttons');
      await this.injectPaymentLinks(page, paymentLinks);
      console.log('Payment links injection completed');
      
      // 9. Wait for content to settle using page evaluation instead of waitForTimeout
      console.log('Waiting for content to settle...');
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));
      console.log('Wait completed');
      
      // 10. Generate PDF
      console.log(`Generating PDF file for: ${tradeOrder}`);
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });
      console.log('PDF generation successful');
      
      // 11. Store the PDF in database
      console.log(`Storing PDF for order: ${tradeOrder}`);
      const pdfInfo = await this.storePdfInDatabase(orderData, pdfBuffer);
      
      console.log(`PDF generation complete for order: ${tradeOrder}`);
      return {
        success: true,
        pdfId: pdfInfo.id,
        filename: pdfInfo.filename,
        tradeOrder
      };
    } catch (error) {
      console.error(`Error generating PDF for order ${tradeOrder}:`, error);
      
      // Update status to failed
      try {
        const orderData = await this.getOrderDataForPdf(tradeOrder);
        await this.updatePdfStatus(
          orderData.record_id, 
          tradeOrder, 
          'failed', 
          error.message || 'PDF generation failed'
        );
      } catch (dbError) {
        console.error(`Failed to update PDF status for ${tradeOrder}:`, dbError);
      }
      
      throw error;
    } finally {
      // Close the browser
      if (browser) {
        console.log('Closing browser...');
        await browser.close();
        console.log('Browser closed');
      }
    }
  }
  
  /**
   * Get all payment links for an order
   * @param {number} orderId - Order record ID
   * @returns {Object} Object with payment links by provider
   */
  async getPaymentLinks(orderId) {
    try {
      console.log(`Retrieving payment links for order ID: ${orderId}`);
      
      const query = `
        SELECT provider, payment_url
        FROM payments
        WHERE order_record_id = $1
        AND status_url = 'success'
        AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC
      `;
      
      const result = await pool.query(query, [orderId]);
      
      const paymentLinks = {};
      
      // Group by provider - take the most recent link for each provider
      result.rows.forEach(row => {
        if (row.payment_url && !paymentLinks[row.provider]) {
          paymentLinks[row.provider] = row.payment_url;
        }
      });
      
      console.log(`Found ${Object.keys(paymentLinks).length} valid payment links`);
      return paymentLinks;
    } catch (error) {
      console.error(`Error retrieving payment links for order ${orderId}:`, error);
      return {}; // Return empty object on error
    }
  }
  
  /**
   * Inject payment links into the payment buttons
   * @param {Page} page - Puppeteer page object
   * @param {Object} paymentLinks - Object with payment links by provider
   */
  async injectPaymentLinks(page, paymentLinks) {
    await page.evaluate((links) => {
      // Helper function to update button
      const updateButton = (id, provider, url) => {
        const button = document.getElementById(id);
        if (button && url) {
          // Set button styles to "ready" state
          button.classList.remove('processing');
          button.classList.add('ready');
          
          // Set the button link and text
          button.href = url;
          
          // Set appropriate text based on provider
          switch (provider) {
            case 'POLi':
              button.innerHTML = 'Pay with POLi';
              break;
            case 'BLINK':
              button.innerHTML = 'Pay with Blink';
              break;
            case 'BTCPAY':
              button.innerHTML = 'Pay with Bitcoin';
              break;
            case 'STRIPE':
              button.innerHTML = 'Pay with Credit Card';
              break;
            case 'ALIPAY':
              button.innerHTML = 'Pay with Alipay';
              break;
            default:
              button.innerHTML = `Pay with ${provider}`;
          }
          
          console.log(`Updated button ${id} with ${provider} link: ${url}`);
        } else if (button) {
          // If button exists but we don't have a link
          button.classList.remove('processing');
          button.classList.add('error');
          button.innerHTML = 'Payment Option Not Available';
          console.log(`No payment link available for ${id}`);
        } else {
          console.log(`Button with ID ${id} not found`);
        }
      };
      
      // Update all payment buttons
      updateButton('paymentButton', 'POLi', links.POLi);
      updateButton('paymentBlinkpay', 'BLINK', links.BLINK);
      updateButton('paymentBitpay', 'BTCPAY', links.BTCPAY);
      updateButton('paymentCreditcard', 'STRIPE', links.STRIPE);
      updateButton('paymentAlipay', 'ALIPAY', links.ALIPAY);
      
      // Update status indicators if they exist
      const updateStatusIndicator = (id) => {
        const element = document.getElementById(id);
        if (element) {
          element.classList.remove('processing', 'error');
          element.classList.add('ready');
          if (element.dataset.originalContent) {
            element.innerHTML = element.dataset.originalContent;
          }
          console.log(`Updated status indicator ${id} to ready state`);
        }
      };
      
      updateStatusIndicator('pdf-checkmark');
      updateStatusIndicator('paylink-checkmark');
      
    }, paymentLinks);
  }
  
  /**
   * Check if a PDF already exists for this order
   * @param {string} tradeOrder - Trade order number
   * @returns {Object|null} Existing PDF record or null
   */
  async checkExistingPdf(tradeOrder) {
    const result = await pool.query(
      `SELECT record_id, status FROM pdforder WHERE trade_order = $1`,
      [tradeOrder]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    return null;
  }
  
  /**
   * Update or create PDF status record
   * @param {number} orderId - Order record ID
   * @param {string} tradeOrder - Trade order number
   * @param {string} status - Status (processing, completed, failed)
   * @param {string} errorMessage - Optional error message
   */
  async updatePdfStatus(orderId, tradeOrder, status, errorMessage = null) {
    const query = `
      INSERT INTO pdforder (order_id, trade_order, status, error_message, filename, pdf_data)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (order_id)
      DO UPDATE SET
        status = $3,
        error_message = $4,
        updated_at = NOW()
      RETURNING record_id
    `;
    
    // Use an empty PDF buffer for processing/failed status
    // The actual PDF will be added when completed
    const emptyBuffer = Buffer.from('');
    const filename = `Order_${tradeOrder}.pdf`;
    
    await pool.query(query, [
      orderId,
      tradeOrder,
      status,
      errorMessage,
      filename,
      emptyBuffer
    ]);
  }

  /**
   * Retrieve complete order data from database
   * @param {string} tradeOrder - The trade order number
   * @returns {Object} Complete order data
   */
  async getOrderDataForPdf(tradeOrder) {
    console.log(`Retrieving data for order: ${tradeOrder}`);
    
    // Query to get order details with latest payment
    const query = `
      SELECT 
        o.*,
        p.amount,
        p.provider,
        p.status_pay,
        p.payment_url
      FROM 
        orders o
      LEFT JOIN 
        payments p ON o.record_id = p.order_record_id 
      WHERE 
        o.trade_order = $1
      ORDER BY 
        p.created_at DESC
      LIMIT 1
    `;
    
    const result = await pool.query(query, [tradeOrder]);
    
    if (result.rows.length === 0) {
      throw new Error(`Order not found: ${tradeOrder}`);
    }
    
    // Ensure we have a total_amount field (for compatibility with Webflow script)
    const orderData = result.rows[0];
    if (!orderData.total_amount) {
      orderData.total_amount = orderData.total_price;
    }
    
    console.log(`Retrieved data for order: ${tradeOrder}`);
    return orderData;
  }

  /**
   * Inject order data directly into DOM elements
   * This approach is more reliable than using sessionStorage
   * @param {Page} page - Puppeteer page object
   * @param {Object} orderData - Order data to inject
   */
  async injectOrderDataToDom(page, orderData) {
    await page.evaluate((data) => {
      // Helper function to update element text content
      const updateElement = (id, value) => {
        const element = document.getElementById(id);
        if (element && value !== undefined && value !== null) {
          element.textContent = value;
          console.log(`Updated ${id} with value: ${value}`);
        } else if (!element) {
          console.log(`Element with ID ${id} not found`);
        }
      };
      
      // Update all relevant elements
      updateElement('First_Name_Order', data.first_name_order);
      updateElement('Last_Name_Order', data.last_name_order);
      updateElement('Email_Order', data.email_order);
      updateElement('token', data.token);
      updateElement('Phone_Order', data.phone_order);
      updateElement('product-name-full', data.product_name_full);
      updateElement('total-price', data.total_price);
      updateElement('quantity', data.quantity);
      updateElement('price_nzd', data.price_nzd);
      updateElement('zoho-id', data.zoho_id);
      updateElement('delivery', data.delivery);
      updateElement('pay-in-person', data.pay_in_person);
      updateElement('checkbox-order', data.checkbox_order);
      updateElement('address', data.address);
      updateElement('message-order', data.message);
      updateElement('poli_pay', data.poli_pay);
      updateElement('date-picker-order', data.date_picker_order);
      updateElement('time-picker-order', data.time_picker_order);
      updateElement('trade-order', data.trade_order);
      updateElement('order_creation_time', data.order_creation_time);
      updateElement('First_Name_Order2', data.first_name_order);
      updateElement('Last_Name_Order2', data.last_name_order);
      updateElement('total-price2', data.total_price);
      updateElement('total-amount', data.total_amount || data.total_price);
      
      // Shipping fee calculation (matching the Webflow script)
      const shippingFeeDiv = document.getElementById('shippingfee');
      if (shippingFeeDiv) {
        const shippingFee = data.delivery === "Shipping" ? "15" : "0";
        shippingFeeDiv.textContent = shippingFee;
        console.log(`Updated shipping fee to: ${shippingFee}`);
      } else {
        console.log('Shipping fee element not found');
      }
      
      console.log('All elements updated successfully');
    }, orderData);
  }

  /**
   * Store PDF in database
   * @param {Object} orderData - Order data
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @returns {Object} Stored PDF information
   */
  async storePdfInDatabase(orderData, pdfBuffer) {
    try {
      // Create a descriptive filename
      const pdfFilename = `Order_${orderData.trade_order}.pdf`;
      
      // Store in database with 'completed' status
      const result = await pool.query(
        `UPDATE pdforder 
         SET pdf_data = $1, filename = $2, status = $3, error_message = NULL
         WHERE trade_order = $4
         RETURNING record_id`,
        [pdfBuffer, pdfFilename, 'completed', orderData.trade_order]
      );
      
      if (result.rows.length === 0) {
        // If no row was updated (shouldn't happen due to prior insertion in updatePdfStatus)
        // Create new record
        const insertResult = await pool.query(
          `INSERT INTO pdforder (
             order_id, trade_order, pdf_data, filename, status
           ) 
           VALUES ($1, $2, $3, $4, $5)
           RETURNING record_id`,
          [
            orderData.record_id, 
            orderData.trade_order, 
            pdfBuffer, 
            pdfFilename, 
            'completed'
          ]
        );
        
        console.log(`New PDF for order ${orderData.trade_order} stored in database with ID: ${insertResult.rows[0].record_id}`);
        return {
          id: insertResult.rows[0].record_id,
          filename: pdfFilename
        };
      }
      
      console.log(`PDF for order ${orderData.trade_order} updated in database with ID: ${result.rows[0].record_id}`);
      return {
        id: result.rows[0].record_id,
        filename: pdfFilename
      };
    } catch (error) {
      console.error(`Failed to store PDF in database for order ${orderData.trade_order}:`, error);
      throw error;
    }
  }
  
  /**
   * Retrieve a PDF from the database by trade order
   * @param {string} tradeOrder - The trade order number
   * @returns {Object|null} PDF data and metadata or null if not found
   */
  async getPdfByTradeOrder(tradeOrder) {
    try {
      const result = await pool.query(
        `SELECT record_id, order_id, trade_order, pdf_data, created_at, filename, status, error_message
         FROM pdforder
         WHERE trade_order = $1`,
        [tradeOrder]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error(`Error retrieving PDF for trade order ${tradeOrder}:`, error);
      throw error;
    }
  }
  
  /**
   * Retrieve PDF by its ID
   * @param {number} pdfId - PDF record ID
   * @returns {Object|null} PDF data and metadata or null if not found
   */
  async getPdfById(pdfId) {
    try {
      const result = await pool.query(
        `SELECT record_id, order_id, trade_order, pdf_data, created_at, filename, status, error_message
         FROM pdforder
         WHERE record_id = $1`,
        [pdfId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error(`Error retrieving PDF with ID ${pdfId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get PDF status for an order
   * @param {string} tradeOrder - Trade order number
   * @returns {Object} Status information or null if not found
   */
  async getPdfStatus(tradeOrder) {
    try {
      const result = await pool.query(
        `SELECT record_id, status, error_message, created_at
         FROM pdforder
         WHERE trade_order = $1`,
        [tradeOrder]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error(`Error retrieving PDF status for trade order ${tradeOrder}:`, error);
      throw error;
    }
  }
  
  /**
   * Ensure the pdforder table exists
   * Creates the table if it doesn't exist
   */
  async ensurePdfOrderTableExists() {
    try {
      // Check if the table exists
      const tableExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'pdforder'
        )
      `);
      
      // If table doesn't exist, create it
      if (!tableExists.rows[0].exists) {
        console.log('Creating pdforder table');
        await pool.query(`
          CREATE TABLE pdforder (
            record_id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(record_id) UNIQUE,
            trade_order TEXT NOT NULL UNIQUE,
            pdf_data BYTEA NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            status TEXT NOT NULL,
            error_message TEXT,
            filename TEXT NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_pdforder_order_id ON pdforder(order_id);
          CREATE INDEX IF NOT EXISTS idx_pdforder_trade_order ON pdforder(trade_order);
        `);
        console.log('pdforder table created successfully');
      }
    } catch (error) {
      console.error('Error ensuring pdforder table exists:', error);
      throw error;
    }
  }
}

module.exports = new PDFService();