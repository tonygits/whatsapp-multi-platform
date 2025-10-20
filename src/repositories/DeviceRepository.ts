import database from '../database/database';
import logger from '../utils/logger';

class DeviceRepository {
    /**
     * Create a new device by device hash
     * @param {Object} deviceData - Device data
     * @returns {Promise<Object>} - Created device with ID
     */
    async create(deviceData: any): Promise<any> {
        try {
            const {
                device_hash,
                container_port,
                phone_number,
                webhook_url,
                webhook_secret,
                status_webhook_url,
                status_webhook_secret
            } = deviceData;

            if (!device_hash) {
                throw new Error('Device hash is mandatory');
            }

            const result = await database.run(
                `INSERT INTO devices (device_hash, container_port, phone_number, webhook_url,
                                      webhook_secret, status_webhook_url, status_webhook_secret)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    device_hash,
                    container_port || null,
                    phone_number,
                    webhook_url || null,
                    webhook_secret || null,
                    status_webhook_url || null,
                    status_webhook_secret || null
                ]
            );

            const device = await database.get(
                'SELECT * FROM devices WHERE id = ?',
                [result.lastID]
            );
            logger.info(`Hashed device created: ${device_hash}`, {deviceId: result.lastID, deviceHash: device_hash});

            return device;
        } catch (error) {
            logger.error('Error creating device:', error);
            throw error;
        }
    }

    /**
     * Find device by device hash
     * @param {string} deviceHash - Device hash
     * @returns {Promise<Object|null>} - Device or null
     */
    async findByDeviceHash(deviceHash: string): Promise<any> {
        try {
            const device = await database.get(
                'SELECT * FROM devices WHERE device_hash = ?',
                [deviceHash]
            );
            return device;
        } catch (error) {
            logger.error('Error fetching device by hash:', error);
            throw error;
        }
    }

    /**
     * Find device by phone number
     * @param {string} phoneNumber - Phone Number
     * @returns {Promise<Object|null>} - PhoneNumber or null
     */
    async findByPhoneNumber(phoneNumber: string): Promise<any> {
        try {
            const device = await database.get(
                'SELECT * FROM devices WHERE phone_number = ?',
                [phoneNumber]
            );
            return device;
        } catch (error) {
            logger.error('Error fetching device by phone:', error);
            throw error;
        }
    }

    /**
     * Get all devices
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} - Array of devices
     */
    async findAll(filters: any = {}): Promise<any[]> {
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
            logger.error('Error listing devices:', error);
            throw error;
        }
    }

    /**
     * Update device
     * @param {number} id - Device ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object|null>} - Updated device or null
     */
    async update(id: number, updateData: any): Promise<any> {
        try {
            const allowedFields = [
                'status', 'container_id', 'phone_number', 'container_port', 'webhook_url',
                'webhook_secret', 'status_webhook_url', 'status_webhook_secret', 'last_seen'
            ];

            // Convert camelCase to snake_case for database
            const fieldMapping = {
                'webhookUrl': 'webhook_url',
                'webhookSecret': 'webhook_secret',
                'statusWebhookUrl': 'status_webhook_url',
                'statusWebhookSecret': 'status_webhook_secret',
                'containerId': 'container_id',
                'containerPort': 'container_port',
                'lastSeen': 'last_seen',
                'phoneNumber': 'phone_number'
            };

            const fields = [];
            const params = [];

            for (const [key, value] of Object.entries(updateData)) {
                // Convert camelCase to snake_case if needed
                const dbField = (fieldMapping as any)[key] || key;

                if (allowedFields.includes(dbField)) {
                    fields.push(`${dbField} = ?`);
                    params.push(value);
                }
            }

            if (fields.length === 0) {
                throw new Error('No valid fields to update');
            }

            params.push(id);

            await database.run(
                `UPDATE devices
                 SET ${fields.join(', ')}
                 WHERE id = ?`,
                params
            );

            // Get the updated device directly
            const updatedDevice = await database.get(
                'SELECT * FROM devices WHERE id = ?',
                [id]
            );
            logger.info(`Updated Device: ${id}`);

            return updatedDevice;
        } catch (error) {
            logger.error('Error updating device:', error);
            throw error;
        }
    }

    /**
     * Delete device
     * @param {number} id - Device ID
     * @returns {Promise<boolean>} - Success status
     */
    async delete(id: number): Promise<boolean> {
        try {
            const result = await database.run(
                'DELETE FROM devices WHERE id = ?',
                [id]
            );

            const success = result.changes > 0;
            if (success) {
                logger.info(`Device removed: ${id}`);
            }

            return success;
        } catch (error) {
            logger.error('Error removing device:', error);
            throw error;
        }
    }


    /**
     * Get device statistics
     * @returns {Promise<Object>} - Device statistics
     */
    async getStatistics(): Promise<any> {
        try {
            const stats = await database.get(`
                SELECT COUNT(*)                                                 as total,
                       SUM(CASE WHEN status = 'connected' THEN 1 ELSE 0 END)    as connected,
                       SUM(CASE WHEN status = 'disconnected' THEN 1 ELSE 0 END) as disconnected,
                       SUM(CASE WHEN status = 'waiting_qr' THEN 1 ELSE 0 END)   as waiting_qr,
                       SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)        as error
                FROM devices
            `);

            return stats;
        } catch (error) {
            logger.error('Error getting statistics:', error);
            throw error;
        }
    }

    /**
     * Convert device data from snake_case to camelCase
     * @param {Object} device - Device with snake_case fields
     * @returns {Object} - Device with camelCase fields
     */
    convertToCamelCase(device: any): any {
        if (!device) return null;

        return {
            id: device.id,
            deviceHash: device.device_hash,
            phoneNumber: device.phone_number,
            status: device.status,
            containerId: device.container_id,
            containerPort: device.container_port,
            webhookUrl: device.webhook_url,
            webhookSecret: device.webhook_secret,
            statusWebhookUrl: device.status_webhook_url,
            statusWebhookSecret: device.status_webhook_secret,
            createdAt: device.created_at,
            updatedAt: device.updated_at,
            lastSeen: device.last_seen
        };
    }
}

export default new DeviceRepository();
