const database = require('../database/database');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');

class DeviceRepository {
  /**
   * Create a new device
   * @param {Object} deviceData - Device data
   * @returns {Promise<Object>} - Created device with ID
   */
  async create(deviceData) {
    try {
      const {
        phone_number,
        name,
        container_port,
        webhook_url,
        webhook_secret,
        status_webhook_url,
        status_webhook_secret
      } = deviceData;

      // Gerar hashes de segurança
      const device_hash = PhoneUtils.generateDeviceId(phone_number);
      const phone_hash = PhoneUtils.hashPhoneNumber(phone_number);

      const result = await database.run(
        `INSERT INTO devices (
           device_hash, phone_number, phone_hash, name, container_port,
           webhook_url, webhook_secret, status_webhook_url, status_webhook_secret
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          device_hash,
          phone_number,
          phone_hash,
          name || null,
          container_port || null,
          webhook_url || null,
          webhook_secret || null,
          status_webhook_url || null,
          status_webhook_secret || null
        ]
      );

      const device = await this.findById(result.lastID);
      logger.info(`Dispositivo criado: ${PhoneUtils.maskForLog(phone_number, 'info')}`, { deviceId: result.lastID, deviceHash: device_hash });
      
      return device;
    } catch (error) {
      logger.error('Erro ao criar dispositivo:', error);
      throw error;
    }
  }


  /**
   * Find device by phone number
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object|null>} - Device or null
   */
  async findByPhoneNumber(phoneNumber) {
    try {
      const device = await database.get(
        'SELECT * FROM devices WHERE phone_number = ?',
        [phoneNumber]
      );
      return device;
    } catch (error) {
      logger.error('Erro ao buscar dispositivo por número:', error);
      throw error;
    }
  }

  /**
   * Find device by device hash
   * @param {string} deviceHash - Device hash
   * @returns {Promise<Object|null>} - Device or null
   */
  async findByDeviceHash(deviceHash) {
    try {
      const device = await database.get(
        'SELECT * FROM devices WHERE device_hash = ?',
        [deviceHash]
      );
      return device;
    } catch (error) {
      logger.error('Erro ao buscar dispositivo por hash:', error);
      throw error;
    }
  }

  /**
   * Get all devices
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} - Array of devices
   */
  async findAll(filters = {}) {
    try {
      let sql = 'SELECT * FROM devices';
      const params = [];
      const conditions = [];

      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' ORDER BY created_at DESC';

      const devices = await database.all(sql, params);
      return devices;
    } catch (error) {
      logger.error('Erro ao listar dispositivos:', error);
      throw error;
    }
  }

  /**
   * Update device
   * @param {number} id - Device ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} - Updated device or null
   */
  async update(id, updateData) {
    try {
      const allowedFields = [
        'name', 'status', 'container_id', 'container_port',
        'qr_code', 'qr_expires_at', 'webhook_url', 'webhook_secret',
        'status_webhook_url', 'status_webhook_secret', 'last_seen'
      ];

      // Convert camelCase to snake_case for database
      const fieldMapping = {
        'webhookUrl': 'webhook_url',
        'webhookSecret': 'webhook_secret',
        'statusWebhookUrl': 'status_webhook_url',
        'statusWebhookSecret': 'status_webhook_secret',
        'containerId': 'container_id',
        'containerPort': 'container_port',
        'qrCode': 'qr_code',
        'qrExpiresAt': 'qr_expires_at',
        'lastSeen': 'last_seen'
      };

      const fields = [];
      const params = [];

      for (const [key, value] of Object.entries(updateData)) {
        // Convert camelCase to snake_case if needed
        const dbField = fieldMapping[key] || key;
        
        if (allowedFields.includes(dbField)) {
          fields.push(`${dbField} = ?`);
          params.push(value);
        }
      }

      if (fields.length === 0) {
        throw new Error('Nenhum campo válido para atualização');
      }

      params.push(id);

      await database.run(
        `UPDATE devices SET ${fields.join(', ')} WHERE id = ?`,
        params
      );

      // Get the updated device directly
      const updatedDevice = await database.get(
        'SELECT * FROM devices WHERE id = ?',
        [id]
      );
      logger.info(`Dispositivo atualizado: ${id}`);
      
      return updatedDevice;
    } catch (error) {
      logger.error('Erro ao atualizar dispositivo:', error);
      throw error;
    }
  }

  /**
   * Delete device
   * @param {number} id - Device ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    try {
      const result = await database.run(
        'DELETE FROM devices WHERE id = ?',
        [id]
      );

      const success = result.changes > 0;
      if (success) {
        logger.info(`Dispositivo removido: ${id}`);
      }
      
      return success;
    } catch (error) {
      logger.error('Erro ao remover dispositivo:', error);
      throw error;
    }
  }




  /**
   * Get device statistics
   * @returns {Promise<Object>} - Device statistics
   */
  async getStatistics() {
    try {
      const stats = await database.get(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'connected' THEN 1 ELSE 0 END) as connected,
          SUM(CASE WHEN status = 'disconnected' THEN 1 ELSE 0 END) as disconnected,
          SUM(CASE WHEN status = 'waiting_qr' THEN 1 ELSE 0 END) as waiting_qr,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
        FROM devices
      `);

      return stats;
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error);
      throw error;
    }
  }

  /**
   * Convert device data from snake_case to camelCase
   * @param {Object} device - Device with snake_case fields
   * @returns {Object} - Device with camelCase fields
   */
  convertToCamelCase(device) {
    if (!device) return null;
    
    return {
      id: device.id,
      deviceHash: device.device_hash,
      phoneNumber: device.phone_number,
      phoneHash: device.phone_hash,
      name: device.name,
      status: device.status,
      containerId: device.container_id,
      containerPort: device.container_port,
      qrCode: device.qr_code,
      qrExpiresAt: device.qr_expires_at,
      webhookUrl: device.webhook_url,
      webhookSecret: device.webhook_secret,
      statusWebhookUrl: device.status_webhook_url,
      statusWebhookSecret: device.status_webhook_secret,
      createdAt: device.created_at,
      updatedAt: device.updated_at,
      lastSeen: device.last_seen,
      retryCount: device.retry_count || 0
    };
  }
}

module.exports = new DeviceRepository();