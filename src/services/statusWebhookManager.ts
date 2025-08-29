
import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger';
import deviceManager from './newDeviceManager';

export interface StatusData {
  type: string;
  code?: string;
  message?: string;
  device_info?: any;
  devices?: any[];
  error?: any;
  data?: any;
}

export interface ContainerEvent {
  code: string;
  message?: string;
  result?: any;
}

class StatusWebhookManager {
  timeout: number;
  retryAttempts: number;

  constructor() {
    this.timeout = 10000; // 10 seconds timeout
    this.retryAttempts = 3;
  }

  /**
   * Send status update to device webhook
   */
  async sendStatusUpdate(deviceHash: string, statusData: StatusData): Promise<void> {
    try {
      const device = await deviceManager.getDevice(deviceHash);
      if (!device || !device.statusWebhookUrl) {
        return; // No webhook configured
      }

      const payload = {
        device: {
          deviceHash: device.deviceHash,
          status: device.status
        },
        event: statusData,
        timestamp: new Date().toISOString()
      };

      await this.sendWebhook(device.statusWebhookUrl, device.statusWebhookSecret, payload);
      
      logger.info(`Status webhook enviado para ${deviceHash}: ${statusData.type}`);
      
    } catch (error: any) {
      logger.error(`Erro ao enviar status webhook para ${deviceHash}:`, error?.message);
    }
  }

  /**
   * Send webhook with retry logic
   */
  async sendWebhook(webhookUrl: string, secret: string, payload: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'WhatsApp-Gateway-Webhook/1.0'
    };

    // Add signature if secret is provided
    if (secret) {
      const signature = this.generateSignature(JSON.stringify(payload), secret);
      headers['X-Webhook-Signature'] = signature;
    }

    let lastError: any;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await axios({
          method: 'POST',
          url: webhookUrl,
          data: payload,
          headers,
          timeout: this.timeout,
          validateStatus: (status: number) => status >= 200 && status < 300
        });

        logger.debug(`Webhook enviado com sucesso (tentativa ${attempt}): ${response.status}`);
        return response;

      } catch (error: any) {
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
   */
  generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Handle WhatsApp container events and send appropriate webhooks
   */
  async handleContainerEvent(deviceHash: string, containerEvent: ContainerEvent): Promise<void> {
    try {
      let statusData: StatusData | null = null;
      let deviceStatus: string | null = null;

      // Parse different container events and determine device status
      switch (containerEvent.code) {
        case 'LOGIN_SUCCESS':
          statusData = {
            type: 'login_success',
            code: containerEvent.code,
            message: containerEvent.message,
            device_info: containerEvent.result
          };
          deviceStatus = 'connected';
          break;

        case 'LIST_DEVICES':
          if (containerEvent.result && containerEvent.result.length > 0) {
            statusData = {
              type: 'connected',
              code: containerEvent.code,
              message: 'Device connected and ready',
              devices: containerEvent.result
            };
            deviceStatus = 'connected';
          } else if (containerEvent.result === null || containerEvent.result.length === 0) {
            statusData = {
              type: 'disconnected',
              code: containerEvent.code,
              message: 'Device disconnected',
              devices: []
            };
            deviceStatus = 'disconnected';
          }
          break;

        case 'AUTH_FAILURE':
          statusData = {
            type: 'auth_failed',
            code: containerEvent.code,
            message: containerEvent.message,
            error: containerEvent.result
          };
          deviceStatus = 'error';
          break;

        case 'CONTAINER_START':
          statusData = {
            type: 'container_event',
            code: containerEvent.code,
            message: 'WhatsApp container started successfully',
            data: containerEvent.result
          };
          deviceStatus = 'running';
          break;

        case 'CONTAINER_STOP':
          statusData = {
            type: 'container_event',
            code: containerEvent.code,
            message: 'WhatsApp container stopped',
            data: containerEvent.result
          };
          deviceStatus = 'stopped';
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

      // Update device status in database if status changed
      if (deviceStatus) {
        await deviceManager.updateDevice(deviceHash, { 
          status: deviceStatus,
          lastSeen: new Date().toISOString()
        });
        logger.info(`Status do dispositivo ${deviceHash} atualizado para: ${deviceStatus}`);
      }

      // Send webhook notification
      if (statusData) {
        await this.sendStatusUpdate(deviceHash, statusData);
      }

    } catch (error: any) {
      logger.error(`Erro ao processar evento do container ${deviceHash}:`, error);
    }
  }
}

// Export singleton instance
const statusWebhookManager = new StatusWebhookManager();
export default statusWebhookManager;