const qrcode = require('qrcode');
const logger = require('../utils/logger');
const deviceManager = require('./deviceManager');

class QRManager {
  constructor() {
    this.qrCodes = new Map(); // phoneNumber -> QR data
    this.qrTimeouts = new Map(); // phoneNumber -> timeout handler
    this.defaultTimeout = parseInt(process.env.QR_CODE_TIMEOUT) || 60000; // 1 minute
    this.maxRetries = parseInt(process.env.QR_CODE_RETRY_LIMIT) || 3;
  }

  /**
   * Store QR code for a device
   * @param {string} phoneNumber - Phone number
   * @param {string} qrCodeData - QR code data
   * @param {number} timeout - Timeout in milliseconds
   */
  async storeQRCode(phoneNumber, qrCodeData, timeout = this.defaultTimeout) {
    logger.info(`Armazenando QR Code para ${phoneNumber}`);

    try {
      // Generate QR code image
      const qrImage = await this.generateQRImage(qrCodeData);
      
      const qrInfo = {
        data: qrCodeData,
        image: qrImage,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + timeout),
        retryCount: 0,
        phoneNumber
      };

      // Store QR code
      this.qrCodes.set(phoneNumber, qrInfo);

      // Update device with QR code
      await deviceManager.updateDevice(phoneNumber, {
        qrCode: qrCodeData,
        authStatus: 'qr_generated',
        lastActivity: new Date().toISOString()
      });

      // Set timeout to auto-expire
      this.setQRTimeout(phoneNumber, timeout);

      // Emit QR code via WebSocket
      this.emitQRCode(phoneNumber, qrInfo);

      logger.info(`QR Code gerado para ${phoneNumber}, expira em ${timeout}ms`);
      return qrInfo;

    } catch (error) {
      logger.error(`Erro ao armazenar QR Code para ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get QR code for a device
   * @param {string} phoneNumber - Phone number
   * @returns {Object|null} - QR code information
   */
  getQRCode(phoneNumber) {
    const qrInfo = this.qrCodes.get(phoneNumber);
    
    if (!qrInfo) {
      return null;
    }

    // Check if expired
    if (Date.now() > qrInfo.expiresAt.getTime()) {
      this.expireQRCode(phoneNumber);
      return null;
    }

    return qrInfo;
  }

  /**
   * Generate QR code image from data
   * @param {string} qrData - QR code data
   * @returns {string} - Base64 encoded image
   */
  async generateQRImage(qrData) {
    try {
      const qrImage = await qrcode.toDataURL(qrData, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256
      });

      return qrImage;
    } catch (error) {
      logger.error('Erro ao gerar imagem QR Code:', error);
      throw error;
    }
  }

  /**
   * Set QR code timeout
   * @param {string} phoneNumber - Phone number
   * @param {number} timeout - Timeout in milliseconds
   */
  setQRTimeout(phoneNumber, timeout) {
    // Clear existing timeout
    if (this.qrTimeouts.has(phoneNumber)) {
      clearTimeout(this.qrTimeouts.get(phoneNumber));
    }

    // Set new timeout
    const timeoutHandler = setTimeout(() => {
      this.expireQRCode(phoneNumber);
    }, timeout);

    this.qrTimeouts.set(phoneNumber, timeoutHandler);
  }

  /**
   * Expire QR code
   * @param {string} phoneNumber - Phone number
   */
  async expireQRCode(phoneNumber) {
    logger.info(`QR Code expirado para ${phoneNumber}`);

    const qrInfo = this.qrCodes.get(phoneNumber);
    
    // Remove QR code
    this.qrCodes.delete(phoneNumber);
    this.qrTimeouts.delete(phoneNumber);

    // Update device
    await deviceManager.updateDevice(phoneNumber, {
      qrCode: null,
      authStatus: 'qr_expired'
    });

    // Emit expiration event
    if (global.socketIO) {
      global.socketIO.to(`device-${phoneNumber}`).emit('qr-expired', {
        phoneNumber,
        retryCount: qrInfo?.retryCount || 0,
        timestamp: new Date().toISOString()
      });
    }

    // Auto-retry if under limit
    if (qrInfo && qrInfo.retryCount < this.maxRetries) {
      logger.info(`Auto-retry QR Code para ${phoneNumber} (tentativa ${qrInfo.retryCount + 1})`);
      
      setTimeout(() => {
        this.requestNewQRCode(phoneNumber, qrInfo.retryCount + 1);
      }, 5000); // Wait 5 seconds before retry
    }
  }

  /**
   * Request new QR code from container
   * @param {string} phoneNumber - Phone number
   * @param {number} retryCount - Current retry count
   */
  async requestNewQRCode(phoneNumber, retryCount = 0) {
    try {
      const device = await deviceManager.getDevice(phoneNumber);
      
      if (!device) {
        throw new Error(`Dispositivo ${phoneNumber} não encontrado`);
      }

      logger.info(`Solicitando novo QR Code para ${phoneNumber}`);

      // Send request to container
      const axios = require('axios');
      const containerUrl = `http://localhost:${device.port}`;
      
      await axios.get(`${containerUrl}/app/login`, {
        timeout: 10000
      });

      // Update retry count
      await deviceManager.updateDevice(phoneNumber, {
        retryCount,
        authStatus: 'qr_requested'
      });

    } catch (error) {
      logger.error(`Erro ao solicitar novo QR Code para ${phoneNumber}:`, error);
      
      await deviceManager.updateDevice(phoneNumber, {
        authStatus: 'qr_error',
        retryCount
      });
    }
  }

  /**
   * Handle successful authentication
   * @param {string} phoneNumber - Phone number
   */
  async handleAuthSuccess(phoneNumber) {
    logger.info(`Autenticação bem-sucedida para ${phoneNumber}`);

    // Remove QR code
    this.qrCodes.delete(phoneNumber);
    
    if (this.qrTimeouts.has(phoneNumber)) {
      clearTimeout(this.qrTimeouts.get(phoneNumber));
      this.qrTimeouts.delete(phoneNumber);
    }

    // Update device
    await deviceManager.updateDevice(phoneNumber, {
      qrCode: null,
      authStatus: 'authenticated',
      status: 'active',
      retryCount: 0
    });

    // Emit success event
    if (global.socketIO) {
      global.socketIO.to(`device-${phoneNumber}`).emit('auth-success', {
        phoneNumber,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle authentication failure
   * @param {string} phoneNumber - Phone number
   * @param {string} reason - Failure reason
   */
  async handleAuthFailure(phoneNumber, reason = 'Unknown error') {
    logger.warn(`Falha na autenticação para ${phoneNumber}: ${reason}`);

    // Remove QR code
    this.qrCodes.delete(phoneNumber);
    
    if (this.qrTimeouts.has(phoneNumber)) {
      clearTimeout(this.qrTimeouts.get(phoneNumber));
      this.qrTimeouts.delete(phoneNumber);
    }

    // Update device
    await deviceManager.updateDevice(phoneNumber, {
      qrCode: null,
      authStatus: 'auth_failed',
      status: 'error'
    });

    // Emit failure event
    if (global.socketIO) {
      global.socketIO.to(`device-${phoneNumber}`).emit('auth-failed', {
        phoneNumber,
        reason,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Emit QR code via WebSocket
   * @param {string} phoneNumber - Phone number
   * @param {Object} qrInfo - QR code information
   */
  emitQRCode(phoneNumber, qrInfo) {
    if (global.socketIO) {
      global.socketIO.to(`device-${phoneNumber}`).emit('qr-code', {
        phoneNumber,
        qrCode: qrInfo.data,
        qrImage: qrInfo.image,
        expiresAt: qrInfo.expiresAt.toISOString(),
        retryCount: qrInfo.retryCount,
        timestamp: new Date().toISOString()
      });

      // Also emit to admin channel
      global.socketIO.emit('device-qr-code', {
        phoneNumber,
        expiresAt: qrInfo.expiresAt.toISOString(),
        retryCount: qrInfo.retryCount,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get all active QR codes
   * @returns {Array} - Array of QR code information
   */
  getAllActiveQRCodes() {
    const activeCodes = [];
    
    for (const [phoneNumber, qrInfo] of this.qrCodes) {
      if (Date.now() <= qrInfo.expiresAt.getTime()) {
        activeCodes.push({
          phoneNumber,
          createdAt: qrInfo.createdAt,
          expiresAt: qrInfo.expiresAt,
          retryCount: qrInfo.retryCount,
          timeRemaining: qrInfo.expiresAt.getTime() - Date.now()
        });
      }
    }

    return activeCodes;
  }

  /**
   * Refresh QR code for a device
   * @param {string} phoneNumber - Phone number
   * @returns {Object} - New QR code information
   */
  async refreshQRCode(phoneNumber) {
    logger.info(`Atualizando QR Code para ${phoneNumber}`);

    // Remove existing QR code
    this.expireQRCode(phoneNumber);

    // Request new QR code
    await this.requestNewQRCode(phoneNumber);

    return {
      success: true,
      message: 'Solicitação de novo QR Code enviada',
      phoneNumber,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clean up expired QR codes
   */
  cleanupExpiredQRCodes() {
    const now = Date.now();
    const expiredPhones = [];

    for (const [phoneNumber, qrInfo] of this.qrCodes) {
      if (now > qrInfo.expiresAt.getTime()) {
        expiredPhones.push(phoneNumber);
      }
    }

    for (const phoneNumber of expiredPhones) {
      this.expireQRCode(phoneNumber);
    }

    if (expiredPhones.length > 0) {
      logger.info(`Limpeza de QR Codes expirados: ${expiredPhones.length} códigos`);
    }
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup() {
    setInterval(() => {
      this.cleanupExpiredQRCodes();
    }, 30000); // Check every 30 seconds

    logger.info('Limpeza periódica de QR Codes iniciada');
  }

  /**
   * Get QR code statistics
   * @returns {Object} - QR code statistics
   */
  getStatistics() {
    return {
      active_qr_codes: this.qrCodes.size,
      pending_timeouts: this.qrTimeouts.size,
      default_timeout: this.defaultTimeout,
      max_retries: this.maxRetries
    };
  }
}

// Export singleton instance
module.exports = new QRManager();