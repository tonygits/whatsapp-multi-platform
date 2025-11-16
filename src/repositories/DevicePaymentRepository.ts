import {DevicePayment, DeviceState} from "../types/device";
import database from "../database/database";
import logger from "../utils/logger";

class DevicePaymentRepository {

    /**
     * Create a new device by device hash
     * @param {Object} deviceStateData - DeviceState data
     * @returns {Promise<Object>} - Created deviceState with ID
     */
    async create(deviceStateData: any): Promise<DevicePayment> {
        try {
            const {
                devicePaymentId,
                deviceId,
                numberHash,
                paymentId,
            } = deviceStateData;

            if (!numberHash || !paymentId) {
                throw new Error('device hash and payment id are mandatory');
            }

            const result = await database.run(
                `INSERT INTO device_payments (id, device_id, device_hash, payment_id)
                 VALUES (?, ?, ?, ?)`,
                [
                    devicePaymentId,
                    deviceId,
                    numberHash,
                    paymentId,
                ]
            );

            const devicePayment = await database.get(
                `SELECT *
                 FROM device_payments
                 WHERE id = ?`,
                [devicePaymentId]
            );
            logger.info(`device payment created: ${devicePaymentId}`, {
                devicePaymentId: devicePaymentId,
                numberHash: numberHash
            });

            return {
                id: devicePayment.id,
                deviceId: devicePayment.device_id,
                numberHash: devicePayment.device_hash,
                paymentId: devicePayment.paymentId,
                createdAt: devicePayment.created_at,
                updatedAt: devicePayment.updated_at,
            };
        } catch (error) {
            logger.error('Error creating device device payment:', error);
            throw error;
        }
    }

    /**
     * Find devicePayment by device payment id
     * @returns {Promise<Object|null>} - DevicePayment or null
     * @param id
     */
    async findDevicePaymentByID(id: string): Promise<DevicePayment> {
        try {
            const devicePayment = await database.get(
                'SELECT * FROM device_payments WHERE id = ?',
                [id]
            );

            return {
                id: devicePayment.id,
                deviceId: devicePayment.device_id,
                numberHash: devicePayment.device_hash,
                paymentId: devicePayment.paymentId,
                createdAt: devicePayment.created_at,
                updatedAt: devicePayment.updated_at,
            };
        } catch (error) {
            logger.error('Error fetching device payment:', error);
            throw error;
        }
    }

    /**
     * Find DevicePayment by device hash
     * @returns {Promise<Object|null>} - DevicePayment or null
     * @param deviceHash
     */
    async listForDeviceHash(deviceHash: string): Promise<DevicePayment[]> {
        try {
            const devicePayments = database.all(
                'SELECT * FROM device_payments WHERE device_hash = ? ',
                [deviceHash]
            );

            if (Array.isArray(devicePayments)) {
                return devicePayments.map((devicePayment: any) => ({
                    id: devicePayment.id,
                    deviceId: devicePayment.device_id,
                    numberHash: devicePayment.device_hash,
                    paymentId: devicePayment.paymentId,
                    createdAt: devicePayment.created_at,
                    updatedAt: devicePayment.updated_at,
                }))
            } else {
                logger.warn('listForDeviceHash() did not return an array of device payments');
                return [];
            }
        } catch (error) {
            logger.error('Error listing device payment by device hash:', error);
            throw error;
        }
    }
}

export default new DevicePaymentRepository();
