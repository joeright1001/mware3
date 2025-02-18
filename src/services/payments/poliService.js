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
 * 
 * Flow:
 * 1. Receives order data
 * 2. Generates expiry timestamp in NZ timezone
 * 3. Creates POLi API payload
 * 4. Makes API request to generate payment link
 * 5. Stores payment record in database
 * 
 * Requirements:
 * - POLi API credentials in environment variables
 * - PostgreSQL database connection
 * - Axios for HTTP requests
 */

const axios = require('axios');
const pool = require('../../config/database');

class PoliService {
    /**
     * Generates a payment link through POLi API
     * @param {Object} orderData - Contains order details including total_price and trade_order
     * @returns {String} Payment URL for redirect
     */
    async generatePaymentLink(orderData) {
        try {
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
                timeZone: 'Pacific/Auckland',  // New Zealand timezone (+13)
                hour12: false
            }).replace(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/, '$3-$2-$1T$4:$5:$6+13:00');

            console.log('Generated Expiry Time:', formattedExpiry);

            // Construct payload for POLi API
            const payload = {
                LinkType: "0",
                Amount: orderData.total_price.toString(),
                MerchantReference: orderData.trade_order,
                LinkExpiry: formattedExpiry
            };

            console.log('Payload:', JSON.stringify(payload));

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
            console.log('Response:', response.data);

            // Store successful payment record in database
            await pool.query(
                `INSERT INTO payments (order_record_id, provider, status, amount, payment_url) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [orderData.record_id, 'POLi', 'success', orderData.total_price, paymentUrl]
            );

            return paymentUrl;

        } catch (error) {
            console.error('POLi API Error:', error.response?.data || error.message);
            
            // Store failed payment record in database
            await pool.query(
                `INSERT INTO payments (order_record_id, provider, status, amount, error_message) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [orderData.record_id, 'POLi', 'failed', orderData.total_price, 
                 error.response?.data?.ErrorMessage || error.message]
            );
            throw error;
        }
    }
}

module.exports = new PoliService();