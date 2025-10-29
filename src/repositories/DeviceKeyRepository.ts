import database from "../database/database";
import logger from "../utils/logger";
import {DeviceKey} from "../types/deviceKey";

class DeviceKeyRepository {
    /**
     * Create a new device by device hash
     * @param {Object} deviceKeyData - DeviceKey data
     * @returns {Promise<Object>} - Created deviceKey with ID
     */
    async create(deviceKeyData: any): Promise<DeviceKey> {
        try {
            const {
                deviceKeyId,
                deviceHash,
                userId,
                apiKeyId,
                deactivatedAt,
                encryptedToken,
            } = deviceKeyData;

            if (!apiKeyId) {
                throw new Error('Device hash is mandatory');
            }

            const result = await database.run(
                `INSERT INTO device_keys (id, device_hash, user_id, api_key_id, deactivated_at, encrypted_token)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    deviceKeyId,
                    deviceHash,
                    userId,
                    apiKeyId,
                    deactivatedAt || null,
                    encryptedToken,
                ]
            );

            const deviceKey = await database.get(
                `SELECT * FROM device_keys WHERE id = ?`,
                [deviceKeyId]
            );
            logger.info(`device key created: ${apiKeyId}`, {deviceKeyId: deviceKeyId, apiKeyId: apiKeyId});

            return {
                id: deviceKey.id,
                deviceHash: deviceKey.device_hash,
                apiKeyId: deviceKey.api_key_id,
                deactivatedAt: deviceKey.deactivated_at,
                userId: deviceKey.user_id,
                encryptedToken: deviceKey.encrypted_token,
                createdAt: deviceKey.created_at,
                updatedAt: deviceKey.updated_at,
            };
        } catch (error) {
            logger.error('Error creating device key:', error);
            throw error;
        }
    }

    /**
     * Find device by phone number
     * @returns {Promise<Object|null>} - DeviceKey or null
     * @param apiKey
     */
    async findByApiKey(apiKey: string): Promise<DeviceKey |null> {
        try {
            const deviceKey = await database.get(
                'SELECT * FROM device_keys WHERE api_key_id = ? AND deactivated_at IS NULL',
                [apiKey]
            );

            if (!deviceKey) {
                return null
            }

            return {
                id: deviceKey.id,
                deviceHash: deviceKey.device_hash,
                apiKeyId: deviceKey.api_key_id,
                deactivatedAt: deviceKey.deactivated_at,
                userId: deviceKey.user_id,
                encryptedToken: deviceKey.encrypted_token,
                createdAt: deviceKey.created_at,
                updatedAt: deviceKey.updated_at,
            };
        } catch (error) {
            logger.error('Error fetching device by key:', error);
            throw error;
        }
    }


    /**
     * Find device by phone number
     * @returns {Promise<Object|null>} - DeviceKey or null
     * @param userId
     * @param device_hash
     */
    async findByUserIdAndDeviceId(userId: string, deviceHash: string): Promise<DeviceKey |null> {
        try {
            const deviceKey = await database.get(
                `SELECT * FROM device_keys WHERE user_id = ? AND device_hash = ? AND deactivated_at IS NULL`,
                [userId, deviceHash]
            );

            if (!deviceKey) {
                return null
            }

            return {
                id: deviceKey.id,
                deviceHash: deviceKey.device_hash,
                apiKeyId: deviceKey.api_key_id,
                deactivatedAt: deviceKey.deactivated_at,
                userId: deviceKey.user_id,
                encryptedToken: deviceKey.encrypted_token,
                createdAt: deviceKey.created_at,
                updatedAt: deviceKey.updated_at,
            };
        } catch (error) {
            logger.error('Error fetching device by key:', error);
            throw error;
        }
    }


    /**
     * Deactivate deviceKey
     * @returns {Promise<any>} - deviceKey
     * @param deviceKeyId
     */
    async deactivateKey(deviceKeyId: string): Promise<DeviceKey> {
        try {
            await database.run(
                `UPDATE device_keys
                 SET deactivated_at=datetime('now')
                 WHERE id = ?`,
                [deviceKeyId]
            );

            const deviceKey = await database.get(
                'SELECT * FROM device_keys WHERE id = ?',
                [deviceKeyId]
            );

            return {
                id: deviceKey.id,
                deviceHash: deviceKey.device_hash,
                apiKeyId: deviceKey.api_key_id,
                deactivatedAt: deviceKey.deactivated_at,
                userId: deviceKey.user_id,
                encryptedToken: deviceKey.encrypted_token,
                createdAt: deviceKey.created_at,
                updatedAt: deviceKey.updated_at,
            };
        } catch (error) {
            logger.error('Error deactivate device key:', error);
            throw error;
        }
    }
}

export default new DeviceKeyRepository();
