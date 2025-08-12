const logger = require('../utils/logger');
const deviceRepository = require('../repositories/DeviceRepository');

class DeviceManager {
  constructor() {
    this.cleanupInterval = null;
    this.basePort = 8000; // Starting port for WhatsApp containers
    this.usedPorts = new Set();
  }

  /**
   * Initialize the device manager
   */
  async initialize() {
    logger.info('Inicializando Device Manager (SQLite)...');
    
    try {
      // Load existing ports to avoid conflicts
      await this.loadUsedPorts();
      
      // Start periodic QR cleanup
      this.startQRCleanup();
      
      logger.info('Device Manager inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar Device Manager:', error);
      throw error;
    }
  }

  /**
   * Load used ports from existing devices
   */
  async loadUsedPorts() {
    try {
      const devices = await deviceRepository.findAll();
      for (const device of devices) {
        if (device.container_port) {
          this.usedPorts.add(device.container_port);
        }
      }
      logger.info(`Carregadas ${this.usedPorts.size} portas em uso`);
    } catch (error) {
      logger.error('Erro ao carregar portas usadas:', error);
    }
  }

  /**
   * Get next available port
   */
  getNextAvailablePort() {
    let port = this.basePort;
    while (this.usedPorts.has(port)) {
      port++;
    }
    this.usedPorts.add(port);
    return port;
  }

  /**
   * Release a port
   */
  releasePort(port) {
    this.usedPorts.delete(port);
  }

  /**
   * Register a new device
   * @param {string} phoneNumber - Phone number
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Device configuration
   */
  async registerDevice(phoneNumber, options = {}) {
    try {
      logger.info(`Registrando dispositivo: ${phoneNumber}`);

      // Check if device already exists
      const existingDevice = await deviceRepository.findByPhoneNumber(phoneNumber);
      if (existingDevice) {
        throw new Error(`Dispositivo ${phoneNumber} já registrado`);
      }

      // Allocate port for the device
      const port = this.getNextAvailablePort();

      // Create device record
      const device = await deviceRepository.create({
        phone_number: phoneNumber,
        name: options.name || `Device ${phoneNumber}`,
        container_port: port,
        webhook_url: options.webhookUrl,
        webhook_secret: options.webhookSecret,
        status_webhook_url: options.statusWebhookUrl,
        status_webhook_secret: options.statusWebhookSecret
      });

      logger.info(`Dispositivo registrado com sucesso: ${phoneNumber}`, { deviceId: device.id, port });
      
      return {
        id: device.id,
        deviceHash: device.device_hash,
        phoneNumber: device.phone_number,
        name: device.name,
        status: device.status,
        port: device.container_port,
        webhookUrl: device.webhook_url,
        webhookSecret: device.webhook_secret,
        statusWebhookUrl: device.status_webhook_url,
        statusWebhookSecret: device.status_webhook_secret,
        createdAt: device.created_at
      };
    } catch (error) {
      logger.error(`Erro ao registrar dispositivo ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Remove a device
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<boolean>} - Success status
   */
  async removeDevice(phoneNumber) {
    try {
      logger.info(`Removendo dispositivo: ${phoneNumber}`);

      const device = await deviceRepository.findByPhoneNumber(phoneNumber);
      if (!device) {
        throw new Error(`Dispositivo ${phoneNumber} não encontrado`);
      }

      // Release the port
      if (device.container_port) {
        this.releasePort(device.container_port);
      }

      // Remove from database
      const success = await deviceRepository.delete(device.id);
      
      if (success) {
        logger.info(`Dispositivo removido com sucesso: ${phoneNumber}`);
      }
      
      return success;
    } catch (error) {
      logger.error(`Erro ao remover dispositivo ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get device information
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object|null>} - Device information
   */
  async getDevice(phoneNumber) {
    try {
      const device = await deviceRepository.findByPhoneNumber(phoneNumber);
      
      if (!device) {
        return null;
      }

      return {
        id: device.id,
        deviceHash: device.device_hash,
        phoneNumber: device.phone_number,
        name: device.name,
        status: device.status,
        containerInfo: {
          containerId: device.container_id,
          port: device.container_port
        },
        qrCode: device.qr_code,
        qrExpiresAt: device.qr_expires_at,
        webhookUrl: device.webhook_url,
        webhookSecret: device.webhook_secret,
        statusWebhookUrl: device.status_webhook_url,
        statusWebhookSecret: device.status_webhook_secret,
        createdAt: device.created_at,
        updatedAt: device.updated_at,
        lastSeen: device.last_seen
      };
    } catch (error) {
      logger.error(`Erro ao buscar dispositivo ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * List all devices
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} - Array of devices
   */
  async listDevices(filters = {}) {
    try {
      const devices = await deviceRepository.findAll(filters);
      
      return devices.map(device => ({
        id: device.id,
        deviceHash: device.device_hash,
        phoneNumber: device.phone_number,
        name: device.name,
        status: device.status,
        containerInfo: {
          containerId: device.container_id,
          port: device.container_port
        },
        qrCode: device.qr_code ? 'present' : null, // Don't expose QR data in lists
        qrExpiresAt: device.qr_expires_at,
        webhookUrl: device.webhook_url,
        webhookSecret: device.webhook_secret,
        statusWebhookUrl: device.status_webhook_url,
        statusWebhookSecret: device.status_webhook_secret,
        createdAt: device.created_at,
        updatedAt: device.updated_at,
        lastSeen: device.last_seen,
        retryCount: device.retry_count
      }));
    } catch (error) {
      logger.error('Erro ao listar dispositivos:', error);
      throw error;
    }
  }

  /**
   * Update device status
   * @param {string} phoneNumber - Phone number
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   * @returns {Promise<Object|null>} - Updated device
   */
  async updateDeviceStatus(phoneNumber, status, additionalData = {}) {
    try {
      const device = await deviceRepository.findByPhoneNumber(phoneNumber);
      if (!device) {
        throw new Error(`Dispositivo ${phoneNumber} não encontrado`);
      }

      const updateData = {
        status,
        last_seen: new Date().toISOString(),
        ...additionalData
      };

      const updatedDevice = await deviceRepository.update(device.id, updateData);
      
      logger.info(`Status do dispositivo ${phoneNumber} atualizado para: ${status}`);
      
      return updatedDevice;
    } catch (error) {
      logger.error(`Erro ao atualizar status do dispositivo ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Set QR code for device
   * @param {string} phoneNumber - Phone number
   * @param {string} qrCode - QR code data
   * @param {number} expiresInMinutes - QR expiration time in minutes
   * @returns {Promise<Object|null>} - Updated device
   */
  async setDeviceQRCode(phoneNumber, qrCode, expiresInMinutes = 5) {
    try {
      const device = await deviceRepository.findByPhoneNumber(phoneNumber);
      if (!device) {
        throw new Error(`Dispositivo ${phoneNumber} não encontrado`);
      }

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

      const updatedDevice = await deviceRepository.setQRCode(device.id, qrCode, expiresAt);
      
      logger.info(`QR Code definido para dispositivo ${phoneNumber}, expira em: ${expiresAt.toISOString()}`);
      
      return updatedDevice;
    } catch (error) {
      logger.error(`Erro ao definir QR Code para dispositivo ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get device statistics
   * @returns {Promise<Object>} - Device statistics
   */
  async getStatistics() {
    try {
      const stats = await deviceRepository.getStatistics();
      return stats;
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error);
      throw error;
    }
  }

  /**
   * Start periodic QR code cleanup
   */
  startQRCleanup() {
    // Clean expired QR codes every 5 minutes
    this.cleanupInterval = setInterval(async () => {
      try {
        await deviceRepository.clearExpiredQRCodes();
      } catch (error) {
        logger.error('Erro na limpeza automática de QR codes:', error);
      }
    }, 5 * 60 * 1000);

    logger.info('Limpeza automática de QR codes iniciada (5 min)');
  }

  /**
   * Stop QR cleanup interval
   */
  stopQRCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Limpeza automática de QR codes parada');
    }
  }

  /**
   * Update device (alias for updateDeviceStatus with more flexibility)
   * @param {string} phoneNumber - Phone number
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} - Updated device
   */
  async updateDevice(phoneNumber, updateData) {
    try {
      const device = await deviceRepository.findByPhoneNumber(phoneNumber);
      if (!device) {
        throw new Error(`Dispositivo ${phoneNumber} não encontrado`);
      }

      const updatedDevice = await deviceRepository.update(device.id, updateData);
      
      logger.info(`Dispositivo ${phoneNumber} atualizado`);
      
      return updatedDevice;
    } catch (error) {
      logger.error(`Erro ao atualizar dispositivo ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get devices by status
   * @param {string} status - Device status
   * @returns {Promise<Array>} - Array of devices
   */
  async getDevicesByStatus(status) {
    return this.listDevices({ status });
  }

  /**
   * Get all devices (alias for listDevices)
   * @returns {Promise<Array>} - Array of devices
   */
  async getAllDevices() {
    return this.listDevices();
  }

  /**
   * Get statistics (alias for getStatistics)
   * @returns {Promise<Object>} - Device statistics
   */
  async getStats() {
    return this.getStatistics();
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    this.stopQRCleanup();
    logger.info('Device Manager cleanup concluído');
  }
}

module.exports = new DeviceManager();