/**
 * POLi Payment Service Integration
 * 
 * This service handles the integration with POLi payment gateway for processing payments
 * in New Zealand. It provides functionality to generate payment links and handle payment
 * transactions through the POLi API.
 * 
 * Key Features:
 * - Generates payment links with 30-minute expiry
 * - Handles NZ timezone specific formatting
 * - Stores payment records in database
 * - Error handling and logging
 * - Extracts and stores payment token for status checking
 * - Schedules status checks at 1min and 3min (for testing)
 * 
 * Flow:
 * 1. Receives order data
 * 2. Generates expiry timestamp in NZ timezone
 * 3. Creates POLi API payload
 * 4. Makes API request to generate payment link
 * 5. Extracts payment token from URL
 * 6. Stores payment record with token in database
 * 7. Schedules status checks
 * 
 * Requirements:
 * - POLi API credentials in environment variables
 * - PostgreSQL database connection
 * - Axios for HTTP requests
 */

const axios = require('axios');
const pool = require('../../config/database');
const { schedulePaymentStatusChecks } = require('./paystatus/paymentStatusQueue');

class PoliService {
    /**
     * Generates a payment link through POLi API
     * @param {Object} orderData - Contains order details including total_price and trade_order
     * @returns {String} Payment URL for redirect
     */
    async generatePaymentLink(orderData) {
        try {
            console.log('\n=== POLi Payment Processing ===');
            console.log('Generating POLi payment link for order:', orderData.trade_order);

            // Calculate expiry time 30 minutes from now
            const date = new Date();
            const futureDate = new Date(date.getTime() + (30 * 60 * 1000));
            
            // Format with New Zealand timezone (UTC+13)
            const formattedExpiry = futureDate.toLocaleString('en-NZ', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Pacific/Auckland',
                hour12: false
            }).replace(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/, '$3-$2-$1T$4:$5:$6+13:00');

            console.log('POLi Generated Expiry Time:', formattedExpiry);

            // Construct payload for POLi API
            const payload = {
                LinkType: "0",
                Amount: orderData.total_price.toString(),
                MerchantReference: orderData.trade_order,
                LinkExpiry: formattedExpiry
            };

            console.log('POLi API Payload:', JSON.stringify(payload));

            // Make API request to POLi
            const response = await axios.post(
                process.env.POLI_API_URL,
                payload,
                {
                    headers: {
                        'Authorization': `Basic ${process.env.POLI_AUTH_CODE}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Process response and remove quotes
            const paymentUrl = response.data.replace(/"/g, '');
            console.log('POLi API Response:', paymentUrl);

            // Extract the token from the URL
            // URL format example: https://poliapi.uat3.paywithpoli.com/api/POLiLink/Navigate/wsWnx
            const payidMatch = paymentUrl.match(/\/([^\/]+)$/);
            const payid = payidMatch ? payidMatch[1] : null;

            console.log('Extracted POLi token (payid):', payid);

            // Store successful payment record in database with payid
            const result = await pool.query(
                `INSERT INTO payments (order_record_id, provider, status_url, amount, payment_url, payid) 
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING record_id`,
                [orderData.record_id, 'POLi', 'success', orderData.total_price, paymentUrl, payid]
            );
            
            const paymentRecordId = result.rows[0]?.record_id;

            // Schedule status checks at 1min and 3min after creation (for testing)
            if (payid && paymentRecordId) {
                schedulePaymentStatusChecks({
                    record_id: paymentRecordId,
                    provider: 'POLi',
                    payid: payid
                });
            }

            return paymentUrl;

        } catch (error) {
            console.error('\n=== POLi API Error ===');
            console.error('Error details:', {
                message: error.message,
                response: error.response?.data,
                order: orderData.trade_order
            });
            
            // Store failed payment record in database
            await pool.query(
                `INSERT INTO payments (order_record_id, provider, status_url, amount, message_url) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [orderData.record_id, 'POLi', 'failed', orderData.total_price, 
                 error.response?.data?.ErrorMessage || error.message]
            );
            throw error;
        }
    }
}

module.exports = new PoliService();