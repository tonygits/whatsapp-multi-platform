const database = require('../database/database');
const logger = require('../utils/logger');

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
        session_id,
        container_port,
        webhook_url,
        user_id
      } = deviceData;

      const result = await database.run(
        `INSERT INTO devices (phone_number, name, session_id, container_port, webhook_url, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [phone_number, name || null, session_id || null, container_port || null, webhook_url || null, user_id || null]
      );

      const device = await this.findById(result.lastID);
      logger.info(`Dispositivo criado: ${phone_number}`, { deviceId: result.lastID });
      
      return device;
    } catch (error) {
      logger.error('Erro ao criar dispositivo:', error);
      throw error;
    }
  }

  /**
   * Find device by ID
   * @param {number} id - Device ID
   * @returns {Promise<Object|null>} - Device or null
   */
  async findById(id) {
    try {
      const device = await database.get(
        'SELECT * FROM devices WHERE id = ?',
        [id]
      );
      return device;
    } catch (error) {
      logger.error('Erro ao buscar dispositivo por ID:', error);
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
   * Find device by session ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} - Device or null
   */
  async findBySessionId(sessionId) {
    try {
      const device = await database.get(
        'SELECT * FROM devices WHERE session_id = ?',
        [sessionId]
      );
      return device;
    } catch (error) {
      logger.error('Erro ao buscar dispositivo por session ID:', error);
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

      if (filters.user_id) {
        conditions.push('user_id = ?');
        params.push(filters.user_id);
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
        'qr_code', 'qr_expires_at', 'webhook_url', 'last_seen'
      ];

      const fields = [];
      const params = [];

      for (const [key, value] of Object.entries(updateData)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);
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

      const updatedDevice = await this.findById(id);
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
   * Update device status
   * @param {number} id - Device ID
   * @param {string} status - New status
   * @returns {Promise<Object|null>} - Updated device
   */
  async updateStatus(id, status) {
    return this.update(id, { 
      status, 
      last_seen: new Date().toISOString() 
    });
  }

  /**
   * Set QR code for device
   * @param {number} id - Device ID
   * @param {string} qrCode - QR code data
   * @param {Date} expiresAt - QR expiration time
   * @returns {Promise<Object|null>} - Updated device
   */
  async setQRCode(id, qrCode, expiresAt) {
    return this.update(id, {
      qr_code: qrCode,
      qr_expires_at: expiresAt.toISOString(),
      status: 'waiting_qr'
    });
  }

  /**
   * Clear expired QR codes
   * @returns {Promise<number>} - Number of cleared QR codes
   */
  async clearExpiredQRCodes() {
    try {
      const result = await database.run(
        `UPDATE devices 
         SET qr_code = NULL, qr_expires_at = NULL 
         WHERE qr_expires_at < datetime('now')`,
        []
      );

      if (result.changes > 0) {
        logger.info(`${result.changes} QR codes expirados limpos`);
      }

      return result.changes;
    } catch (error) {
      logger.error('Erro ao limpar QR codes expirados:', error);
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
}

module.exports = new DeviceRepository();