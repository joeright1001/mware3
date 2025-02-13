// src/services/payments/poliService.js

const axios = require('axios');
const pool = require('../../config/database');

class PoliService {
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

            const payload = {
                LinkType: "0",
                Amount: orderData.total_price.toString(),
                MerchantReference: orderData.trade_order,
                LinkExpiry: formattedExpiry
            };

            console.log('Payload:', JSON.stringify(payload));

            const response = await axios.post(
                'https://poliapi.uat3.paywithpoli.com/api/POLiLink/Create',
                payload,
                {
                    headers: {
                        'Authorization': `Basic ${process.env.POLI_AUTH_CODE}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const paymentUrl = response.data.replace(/"/g, '');
            console.log('Response:', response.data);

            await pool.query(
                `INSERT INTO payments (order_record_id, provider, status, amount, payment_url) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [orderData.record_id, 'POLi', 'success', orderData.total_price, paymentUrl]
            );

            return paymentUrl;

        } catch (error) {
            console.error('POLi API Error:', error.response?.data || error.message);
            
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