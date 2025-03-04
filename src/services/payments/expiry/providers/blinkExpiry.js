const axios = require('axios');

class BlinkExpiryProvider {
    constructor() {
        this.baseUrl = process.env.BLINK_API_BASE_URL;
    }

    async revokePayment(payid, token) {
        try {
            console.log(`Revoking Blink payment: ${payid}`);
            
            await axios.delete(
                `${this.baseUrl}/quick-payments/${payid}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            console.log(`Successfully revoked Blink payment: ${payid}`);
            return true;
        } catch (error) {
            console.error(`Failed to revoke Blink payment ${payid}:`, error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new BlinkExpiryProvider();