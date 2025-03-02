/**
 * BTCPay Server Payment Status Provider
 * -----------------------------------
 * Purpose: Handles BTCPay-specific payment status checking
 * 
 * Functions:
 * - Connect to BTCPay Server API with proper authentication
 * - Query invoice status using the stored invoice ID
 * - Parse and normalize API responses
 * - Handle BTCPay-specific error conditions
 */

const axios = require('axios');

class BTCPayPaymentStatus {
    constructor() {
        // Remove trailing slash if present in API URL
        this.baseUrl = process.env.BTCPAY_API_URL?.replace(/\/$/, '');
        this.apiKey = process.env.BTCPAY_API_KEY;
        this.storeId = process.env.BTCPAY_STORE_ID;
    }

    /**
     * Check the status of a BTCPay invoice
     * @param {string} invoiceId - The BTCPay invoice ID to check
     * @returns {Object} Normalized status information
     */
    async checkStatus(invoiceId) {
        try {
            console.log(`Checking BTCPay invoice status for: ${invoiceId}`);
            
            if (!this.baseUrl || !this.apiKey || !this.storeId) {
                throw new Error('BTCPay configuration is incomplete');
            }
            
            // Make API request to BTCPay Server
            const response = await axios.get(
                `${this.baseUrl}/api/v1/stores/${this.storeId}/invoices/${invoiceId}`,
                {
                    headers: {
                        'Authorization': `token ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log(`BTCPay status response for ${invoiceId}:`, {
                status: response.data.status,
                additionalStatus: response.data.additionalStatus
            });
            
            return {
                status: this.normalizeStatus(response.data.status, response.data.additionalStatus),
                originalStatus: `${response.data.status}/${response.data.additionalStatus || 'none'}`,
                message: `BTCPay status check successful: ${response.data.status}`
            };
        } catch (error) {
            console.error(`BTCPay status check error for ${invoiceId}:`, {
                message: error.message,
                response: error.response?.data || error.response?.statusText
            });
            
            return {
                status: 'error',
                originalStatus: error.response?.status || 'unknown',
                message: error.response?.data?.message || error.message
            };
        }
    }
    
    /**
     * Maps BTCPay-specific status values to standardized application status values
     * @param {string} invoiceStatus - Status from BTCPay API
     * @param {string} additionalStatus - Additional status details from BTCPay API
     * @returns {string} Normalized status for application use
     */
    normalizeStatus(invoiceStatus, additionalStatus) {
        // Map BTCPay statuses to our application statuses
        const statusMap = {
            'New': 'pending',          // Invoice created but not paid
            'Processing': 'pending',    // Invoice payment is being processed
            'Settled': 'completed',     // Invoice has been fully paid
            'Complete': 'completed',    // Payment confirmed and credited to merchant account
            'Expired': 'expired',       // Invoice expired without being paid
            'Invalid': 'cancelled',     // Invoice is no longer valid
            'Paid': 'completed',        // Invoice has been paid but not yet settled
            'Confirmed': 'completed'    // Payment confirmed but not yet settled
        };
        
        // Additional handling for special cases
        if (invoiceStatus === 'Settled' && additionalStatus === 'paidOver') {
            return 'completed';
        } else if (invoiceStatus === 'Settled' && additionalStatus === 'paidPartial') {
            return 'pending';
        }
        
        return statusMap[invoiceStatus] || 'unknown';
    }
}

module.exports = new BTCPayPaymentStatus();