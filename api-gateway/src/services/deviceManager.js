const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const lockManager = require('./lockManager');

class DeviceManager {
  constructor() {
    this.configPath = process.env.CONFIG_FILE_PATH || './config/devices.json';
    this.devicesCache = null;
    this.cacheTimeout = 30000; // 30 seconds
    this.lastCacheUpdate = null;
  }

  /**
   * Initialize the device manager
   */
  async initialize() {
    logger.info('Inicializando Device Manager...');
    
    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      // Load or create initial config
      await this.loadDevicesConfig();
      
      logger.info('Device Manager inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar Device Manager:', error);
      throw error;
    }
  }

  /**
   * Load devices configuration with caching
   * @param {boolean} forceRefresh - Force refresh cache
   * @returns {Promise<Object>} - Devices configuration
   */
  async loadDevicesConfig(forceRefresh = false) {
    const now = Date.now();
    
    // Return cached data if valid
    if (!forceRefresh && this.devicesCache && 
        this.lastCacheUpdate && 
        (now - this.lastCacheUpdate) < this.cacheTimeout) {
      return this.devicesCache;
    }

    return await lockManager.withLock(this.configPath, async () => {
      try {
        const data = await fs.readFile(this.configPath, 'utf8');
        this.devicesCache = JSON.parse(data);
        this.lastCacheUpdate = now;
        
        logger.debug('Configuração de dispositivos carregada do arquivo');
        return this.devicesCache;
      } catch (error) {
        if (error.code === 'ENOENT') {
          // Create initial config if file doesn't exist
          const initialConfig = this.createInitialConfig();
          await this.saveDevicesConfig(initialConfig);
          this.devicesCache = initialConfig;
          this.lastCacheUpdate = now;
          
          logger.info('Arquivo de configuração inicial criado');
          return this.devicesCache;
        }
        throw error;
      }
    }, 'load');
  }

  /**
   * Save devices configuration
   * @param {Object} config - Configuration to save
   */
  async saveDevicesConfig(config) {
    return await lockManager.withLock(this.configPath, async () => {
      config.metadata.last_updated = new Date().toISOString();
      config.metadata.total_devices = Object.keys(config.devices).length;
      config.metadata.active_devices = Object.values(config.devices)
        .filter(device => device.status === 'active').length;

      const data = JSON.stringify(config, null, 2);
      await fs.writeFile(this.configPath, data, 'utf8');
      
      // Update cache
      this.devicesCache = config;
      this.lastCacheUpdate = Date.now();
      
      logger.debug('Configuração de dispositivos salva');
    }, 'save');
  }

  /**
   * Create initial configuration structure
   * @returns {Object} - Initial configuration
   */
  createInitialConfig() {
    return {
      devices: {},
      ports: {
        used: [],
        available: [],
        last_assigned: parseInt(process.env.CONTAINER_BASE_PORT) || 4000
      },
      metadata: {
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        total_devices: 0,
        active_devices: 0
      }
    };
  }

  /**
   * Register a new device
   * @param {string} phoneNumber - Phone number in format: country + number
   * @param {Object} deviceInfo - Device information
   * @returns {Promise<Object>} - Device registration result
   */
  async registerDevice(phoneNumber, deviceInfo = {}) {
    const config = await this.loadDevicesConfig();
    
    // Check if device already exists
    if (config.devices[phoneNumber]) {
      throw new Error(`Dispositivo ${phoneNumber} já está registrado`);
    }

    // Assign a port
    const port = this.getNextAvailablePort(config);
    
    // Create device entry
    const device = {
      phoneNumber,
      port,
      containerId: null,
      status: 'registered',
      sessionPath: path.join(process.env.VOLUMES_BASE_PATH || './volumes', phoneNumber),
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      qrCode: null,
      authStatus: 'pending',
      retryCount: 0,
      ...deviceInfo
    };

    config.devices[phoneNumber] = device;
    config.ports.used.push(port);
    
    await this.saveDevicesConfig(config);
    
    logger.info(`Dispositivo ${phoneNumber} registrado na porta ${port}`);
    return device;
  }

  /**
   * Update device information
   * @param {string} phoneNumber - Phone number
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Updated device
   */
  async updateDevice(phoneNumber, updates) {
    const config = await this.loadDevicesConfig();
    
    if (!config.devices[phoneNumber]) {
      throw new Error(`Dispositivo ${phoneNumber} não encontrado`);
    }

    config.devices[phoneNumber] = {
      ...config.devices[phoneNumber],
      ...updates,
      lastActivity: new Date().toISOString()
    };

    await this.saveDevicesConfig(config);
    
    logger.debug(`Dispositivo ${phoneNumber} atualizado`);
    return config.devices[phoneNumber];
  }

  /**
   * Remove a device
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<boolean>} - Success status
   */
  async removeDevice(phoneNumber) {
    const config = await this.loadDevicesConfig();
    
    if (!config.devices[phoneNumber]) {
      return false;
    }

    const device = config.devices[phoneNumber];
    
    // Remove port from used list
    const portIndex = config.ports.used.indexOf(device.port);
    if (portIndex !== -1) {
      config.ports.used.splice(portIndex, 1);
    }

    delete config.devices[phoneNumber];
    await this.saveDevicesConfig(config);
    
    logger.info(`Dispositivo ${phoneNumber} removido`);
    return true;
  }

  /**
   * Get device by phone number
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object|null>} - Device information
   */
  async getDevice(phoneNumber) {
    const config = await this.loadDevicesConfig();
    return config.devices[phoneNumber] || null;
  }

  /**
   * Get all devices
   * @returns {Promise<Object>} - All devices
   */
  async getAllDevices() {
    const config = await this.loadDevicesConfig();
    return config.devices;
  }

  /**
   * Get devices by status
   * @param {string} status - Status to filter by
   * @returns {Promise<Array>} - Filtered devices
   */
  async getDevicesByStatus(status) {
    const config = await this.loadDevicesConfig();
    return Object.values(config.devices).filter(device => device.status === status);
  }

  /**
   * Get next available port
   * @param {Object} config - Current configuration
   * @returns {number} - Next available port
   */
  getNextAvailablePort(config) {
    const basePort = parseInt(process.env.CONTAINER_BASE_PORT) || 4000;
    const maxContainers = parseInt(process.env.MAX_CONTAINERS) || 50;
    
    let port = config.ports.last_assigned + 1;
    
    // Find next available port
    while (config.ports.used.includes(port) && port < (basePort + maxContainers)) {
      port++;
    }
    
    if (port >= (basePort + maxContainers)) {
      throw new Error('Número máximo de containers atingido');
    }
    
    config.ports.last_assigned = port;
    return port;
  }

  /**
   * Get configuration statistics
   * @returns {Promise<Object>} - Configuration statistics
   */
  async getStats() {
    const config = await this.loadDevicesConfig();
    const devices = Object.values(config.devices);
    
    return {
      total_devices: devices.length,
      active_devices: devices.filter(d => d.status === 'active').length,
      registered_devices: devices.filter(d => d.status === 'registered').length,
      error_devices: devices.filter(d => d.status === 'error').length,
      ports_used: config.ports.used.length,
      last_updated: config.metadata.last_updated
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.devicesCache = null;
    this.lastCacheUpdate = null;
    logger.debug('Cache de dispositivos limpo');
  }
}

// Export singleton instance
module.exports = new DeviceManager();