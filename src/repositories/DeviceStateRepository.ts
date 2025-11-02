import database from "../database/database";
import logger from "../utils/logger";
import {DeviceState} from "../types/device";
import {randomUUID} from "crypto";

class DeviceStateRepository {

    /**
     * Create a new device by device hash
     * @param {Object} deviceStateData - DeviceState data
     * @returns {Promise<Object>} - Created deviceState with ID
     */
    async create(deviceStateData: any): Promise<DeviceState> {
        try {
            const deviceStateId = randomUUID().toString();
            const {
                deviceId,
                deviceHash,
                userId,
                status,
                lastPaymentDate,
                nextPaymentDate,
                paymentPeriod,
                periodType,
                isRecurring,
            } = deviceStateData;

            if (!deviceHash) {
                throw new Error('Device hash is mandatory');
            }

            const result = await database.run(
                `INSERT INTO device_states (id, device_id, device_hash, user_id, status, last_payment_date, 
                           next_payment_date, payment_period, period_type, is_recurring)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    deviceStateId,
                    deviceId,
                    deviceHash,
                    userId,
                    status,
                    lastPaymentDate || null,
                    nextPaymentDate || null,
                    paymentPeriod,
                    periodType,
                    isRecurring,
                ]
            );

            const deviceState = await database.get(
                `SELECT * FROM device_states WHERE id = ?`,
                [deviceStateId]
            );
            logger.info(`device state created: ${deviceStateId}`, {deviceStateId: deviceStateId, deviceHash: deviceHash});

            return {
                id: deviceState.id,
                deviceId: deviceState.device_id,
                deviceHash: deviceState.device_hash,
                status: deviceState.status,
                userId: deviceState.user_id,
                lastPaymentDate: deviceState.last_payment_date,
                nextPaymentDate: deviceState.next_payment_date,
                paymentPeriod: deviceState.payment_period,
                periodType: deviceState.period_type,
                isRecurring: deviceState.is_recurring,
                createdAt: deviceState.created_at,
                updatedAt: deviceState.updated_at,
            };
        } catch (error) {
            logger.error('Error creating device sate:', error);
            throw error;
        }
    }

    /**
     * Find device by device hash
     * @param {string} deviceHash - DeviceState hash
     * @returns {Promise<Object|null>} - DeviceState or null
     */
    async findByDeviceHash(deviceHash: string): Promise<DeviceState> {
        try {
            const deviceState = await database.get(
                'SELECT * FROM device_states WHERE device_hash = ?',
                [deviceHash]
            );
            return {
                id: deviceState.id,
                deviceId: deviceState.device_id,
                deviceHash: deviceState.device_hash,
                status: deviceState.status,
                userId: deviceState.user_id,
                lastPaymentDate: deviceState.last_payment_date,
                nextPaymentDate: deviceState.next_payment_date,
                paymentPeriod: deviceState.payment_period,
                periodType: deviceState.period_type,
                isRecurring: deviceState.is_recurring,
                createdAt: deviceState.created_at,
                updatedAt: deviceState.updated_at,
            };
        } catch (error) {
            logger.error('Error fetching device by hash:', error);
            throw error;
        }
    }

    /**
     * Update device
     * @param deviceHash
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object|null>} - Updated device or null
     */
    async update(deviceHash: string, updateData: any): Promise<DeviceState> {
        try {
            const allowedFields = [
                'status', 'payment_period', 'period_type', 'is_recurring',
                'last_payment_date', 'next_payment_date',
            ];

            // Convert camelCase to snake_case for database
            const fieldMapping = {
                'status': 'status',
                'paymentPeriod': 'payment_period',
                'periodType': 'period_type',
                'isRecurring': 'is_recurring',
                'lastPaymentDate': 'last_payment_date',
                'nextPaymentDate': 'next_payment_date',
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

            params.push(deviceHash);

            await database.run(
                `UPDATE device_states
                 SET ${fields.join(', ')}
                 WHERE device_hash = ?`,
                params
            );

            // Get the updated device directly
            const updatedDeviceState = await database.get(
                'SELECT * FROM device_states WHERE device_hash = ?',
                [deviceHash]
            );
            logger.info(`Updated device State: ${deviceHash}`);

            return {
                id: updatedDeviceState.id,
                deviceId: updatedDeviceState.device_id,
                deviceHash: updatedDeviceState.device_hash,
                status: updatedDeviceState.status,
                userId: updatedDeviceState.user_id,
                lastPaymentDate: updatedDeviceState.last_payment_date,
                nextPaymentDate: updatedDeviceState.next_payment_date,
                paymentPeriod: updatedDeviceState.payment_period,
                periodType: updatedDeviceState.period_type,
                isRecurring: updatedDeviceState.is_recurring,
                createdAt: updatedDeviceState.created_at,
                updatedAt: updatedDeviceState.updated_at,
            };
        } catch (error) {
            logger.error('Error updating device:', error);
            throw error;
        }
    }
}

export default new DeviceStateRepository();
