const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const deviceManager = require('./newDeviceManager');

class StatusWebhookManager {
  constructor() {
    this.timeout = 10000; // 10 seconds timeout
    this.retryAttempts = 3;
  }

  /**
   * Send status update to device webhook
   * @param {string} phoneNumber - Phone number
   * @param {Object} statusData - Status data to send
   */
  async sendStatusUpdate(phoneNumber, statusData) {
    try {
      const device = await deviceManager.getDevice(phoneNumber);
      if (!device || !device.status_webhook_url) {
        return; // No webhook configured
      }

      const payload = {
        device: {
          phoneNumber: device.phoneNumber,
          name: device.name,
          status: device.status
        },
        event: statusData,
        timestamp: new Date().toISOString()
      };

      await this.sendWebhook(device.status_webhook_url, device.status_webhook_secret, payload);
      
      logger.info(`Status webhook enviado para ${phoneNumber}: ${statusData.type}`);
      
    } catch (error) {
      logger.error(`Erro ao enviar status webhook para ${phoneNumber}:`, error.message);
    }
  }

  /**
   * Send webhook with retry logic
   * @param {string} webhookUrl - Webhook URL
   * @param {string} secret - Webhook secret (optional)
   * @param {Object} payload - Data to send
   */
  async sendWebhook(webhookUrl, secret, payload) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'WhatsApp-Gateway-Webhook/1.0'
    };

    // Add signature if secret is provided
    if (secret) {
      const signature = this.generateSignature(JSON.stringify(payload), secret);
      headers['X-Webhook-Signature'] = signature;
    }

    let lastError;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await axios({
          method: 'POST',
          url: webhookUrl,
          data: payload,
          headers,
          timeout: this.timeout,
          validateStatus: (status) => status >= 200 && status < 300
        });

        logger.debug(`Webhook enviado com sucesso (tentativa ${attempt}): ${response.status}`);
        return response;

      } catch (error) {
        lastError = error;
        
        if (attempt < this.retryAttempts) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
          logger.warn(`Webhook falhou (tentativa ${attempt}/${this.retryAttempts}), tentando novamente em ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Generate HMAC-SHA256 signature for webhook
   * @param {string} payload - Payload string
   * @param {string} secret - Secret key
   * @returns {string} - Signature
   */
  generateSignature(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Handle WhatsApp container events and send appropriate webhooks
   * @param {string} phoneNumber - Phone number
   * @param {Object} containerEvent - Event from container
   */
  async handleContainerEvent(phoneNumber, containerEvent) {
    try {
      let statusData = null;

      // Parse different container events
      switch (containerEvent.code) {
        case 'LOGIN_SUCCESS':
          statusData = {
            type: 'login_success',
            code: containerEvent.code,
            message: containerEvent.message,
            device_info: containerEvent.result
          };
          break;

        case 'LIST_DEVICES':
          if (containerEvent.result && containerEvent.result.length > 0) {
            statusData = {
              type: 'connected',
              code: containerEvent.code,
              message: 'Device connected and ready',
              devices: containerEvent.result
            };
          } else if (containerEvent.result === null) {
            statusData = {
              type: 'disconnected',
              code: containerEvent.code,
              message: 'Device disconnected',
              devices: []
            };
          }
          break;

        case 'QR_CODE':
          statusData = {
            type: 'qr_code_required',
            code: containerEvent.code,
            message: containerEvent.message,
            qr_data: containerEvent.result
          };
          break;

        case 'AUTH_FAILURE':
          statusData = {
            type: 'auth_failed',
            code: containerEvent.code,
            message: containerEvent.message,
            error: containerEvent.result
          };
          break;

        default:
          // Generic event
          statusData = {
            type: 'container_event',
            code: containerEvent.code,
            message: containerEvent.message,
            data: containerEvent.result
          };
          break;
      }

      if (statusData) {
        await this.sendStatusUpdate(phoneNumber, statusData);
      }

    } catch (error) {
      logger.error(`Erro ao processar evento do container ${phoneNumber}:`, error);
    }
  }
}

// Export singleton instance
module.exports = new StatusWebhookManager();