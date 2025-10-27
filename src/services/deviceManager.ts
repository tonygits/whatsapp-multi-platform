import logger from '../utils/logger';
import deviceRepository from '../repositories/DeviceRepository';
import {Device} from "../types/device";

class DeviceManager {
    basePort: number;
    usedPorts: Set<number>;

    constructor() {
        this.basePort = 8000; // Starting port for WhatsApp containers
        this.usedPorts = new Set<number>();
    }

    /**
     * Initialize the device manager
     */
    async initialize() {
        logger.info('Initializing Device Manager (SQLite)...');

        try {
            // Load existing ports to avoid conflicts
            await this.loadUsedPorts();


            logger.info('Device Manager initialized successfully');
        } catch (error) {
            logger.error('Error initializing Device Manager:', error);
            throw error;
        }
    }

    /**
     * Load used ports from existing devices
     */
    async loadUsedPorts() {
        try {
            const filter = {}
            const devices = await deviceRepository.findAll(filter);
            if (Array.isArray(devices)) {
                for (const device of devices) {
                    if (device.container_port) {
                        this.usedPorts.add(device.container_port);
                    }
                }
                logger.info(`Loaded ${this.usedPorts.size} ports in use`);
            } else {
                logger.warn('findAll() did not return an array of devices');
            }
        } catch (error) {
            logger.error('Error loading used ports:', error);
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
    releasePort(port: number) {
        this.usedPorts.delete(port);
    }

    /**
     * Register a new device by hash
     * @param {string} deviceHash - Device hash
     * @param {string} phoneNumber - Phone Number
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} - Device configuration
     */
    async registerDevice(deviceHash: string, phoneNumber: string, options: any = {}): Promise<Device> {
        try {
            logger.info(`Registering device: ${deviceHash}`);

            // Check if device already exists
            let existingDevice = await deviceRepository.findByDeviceHash(deviceHash);
            if (existingDevice) {
                throw new Error(`Device ${deviceHash} already registered`);
            }

            // Check if device already exists
            existingDevice = await deviceRepository.findByPhoneNumber(phoneNumber);
            if (existingDevice) {
                throw new Error(`Device ${phoneNumber} already registered`);
            }

            // Allocate port for the device
            const port = this.getNextAvailablePort();

            // Create device record
            const device = await deviceRepository.create({
                user_id: options.userId,
                device_hash: deviceHash,
                container_port: port,
                phone_number: phoneNumber,
                webhook_url: options.webhookUrl,
                webhook_secret: options.webhookSecret,
                status_webhook_url: options.statusWebhookUrl,
                status_webhook_secret: options.statusWebhookSecret,
            });

            logger.info(`Device registered successfully: ${deviceHash}`, {deviceId: device.id, port});

            return {
                id: device.id,
                userId: device.user_id,
                deviceHash: device.device_hash,
                status: device.status,
                phoneNumber: device.phone_number,
                port: device.container_port,
                webhookUrl: device.webhook_url,
                webhookSecret: device.webhook_secret,
                statusWebhookUrl: device.status_webhook_url,
                statusWebhookSecret: device.status_webhook_secret,
                createdAt: device.created_at
            };
        } catch (error) {
            logger.error(`Error registering device ${deviceHash}:`, error);
            throw error;
        }
    }

    /**
     * Remove a device by hash
     * @param {string} deviceHash - Device hash
     * @returns {Promise<boolean>} - Success status
     */
    async removeDevice(deviceHash: string): Promise<boolean> {
        try {
            logger.info(`Removing device: ${deviceHash}`);

            const device = await deviceRepository.findByDeviceHash(deviceHash);
            if (!device) {
                throw new Error(`Device ${deviceHash} not found`);
            }

            // Release the port
            if (device.container_port) {
                this.releasePort(device.container_port);
            }

            // Remove from database
            const success = await deviceRepository.delete(device);

            if (success) {
                logger.info(`Device successfully removed: ${deviceHash}`);
            }

            return success;
        } catch (error) {
            logger.error(`Error removing device ${deviceHash}:`, error);
            throw error;
        }
    }

    /**
     * Get device information by hash
     * @param {string} deviceHash - Device hash
     * @returns {Promise<Object|null>} - Device information
     */
    async getDevice(deviceHash: string): Promise<any> {
        try {
            const device = await deviceRepository.findByDeviceHash(deviceHash);

            if (!device) {
                return null;
            }

            return {
                id: device.id,
                userId: device.user_id,
                deviceHash: device.device_hash,
                status: device.status,
                phoneNumber: device.phone_number,
                containerInfo: {
                    containerId: device.container_id,
                    port: device.container_port
                },
                webhookUrl: device.webhook_url,
                webhookSecret: device.webhook_secret,
                statusWebhookUrl: device.status_webhook_url,
                statusWebhookSecret: device.status_webhook_secret,
                createdAt: device.created_at,
                updatedAt: device.updated_at,
                lastSeen: device.last_seen
            };
        } catch (error) {
            logger.error(`Error searching for device ${deviceHash}:`, error);
            throw error;
        }
    }

    /**
     * Get device information by hash
     * @param {string} phoneNumber - Phone Number
     * @returns {Promise<Object|null>} - Device information
     */
    async getDeviceByPhone(phoneNumber: string) {
        try {
            const device = await deviceRepository.findByPhoneNumber(phoneNumber);

            if (!device) {
                return null;
            }

            return {
                id: device.id,
                userId: device.user_id,
                deviceHash: device.device_hash,
                status: device.status,
                phoneNumber: device.phone_number,
                containerInfo: {
                    containerId: device.container_id,
                    port: device.container_port
                },
                webhookUrl: device.webhook_url,
                webhookSecret: device.webhook_secret,
                statusWebhookUrl: device.status_webhook_url,
                statusWebhookSecret: device.status_webhook_secret,
                createdAt: device.created_at,
                updatedAt: device.updated_at,
                lastSeen: device.last_seen
            };
        } catch (error) {
            logger.error(`Error searching for device ${phoneNumber}:`, error);
            throw error;
        }
    }

    /**
     * Update device by hash
     * @param {string} deviceHash - Device hash
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object|null>} - Updated device
     */
    async updateDevice(deviceHash: string, updateData: any) {
        try {
            const device = await deviceRepository.findByDeviceHash(deviceHash);
            if (!device) {
                throw new Error(`Device ${deviceHash} not found`);
            }


            const updatedDevice = await deviceRepository.update(device.id, updateData);

            logger.info(`Device ${deviceHash} updated`);

            return updatedDevice;
        } catch (error) {
            logger.error(`Error updating device ${deviceHash}:`, error);
            throw error;
        }
    }

    /**
     * Get devices by status
     * @param userId
     * @param statuses
     * @returns {Promise<Array>} - Array of devices
     */
    async getUserDevicesByStatus(userId: string, statuses: string[]) {
        try {
            const devices = await deviceRepository.findAll({ user_id: userId, status: { $in: statuses } });
            if (Array.isArray(devices)) {
                return devices.map((device: any) => ({
                    id: device.id,
                    userId: device.user_id,
                    deviceHash: device.device_hash,
                    status: device.status,
                    phoneNumber: device.phone_number,
                    containerInfo: {
                        containerId: device.container_id,
                        port: device.container_port
                    },
                    webhookUrl: device.webhook_url,
                    webhookSecret: device.webhook_secret,
                    statusWebhookUrl: device.status_webhook_url,
                    statusWebhookSecret: device.status_webhook_secret,
                    createdAt: device.created_at,
                    updatedAt: device.updated_at,
                    lastSeen: device.last_seen
                }));
            } else {
                logger.warn('findAll({ status }) did not return an array of devices');
                return [];
            }
        } catch (error) {
            logger.error('Error listing devices by status:', error);
            throw error;
        }
    }

    /**
     * Get all devices
     * @returns {Promise<Array>} - Array of devices
     */
    async getUserDevices(userId: string) {
        try {
            const devices = await deviceRepository.findAll({user_id: userId});
            if (Array.isArray(devices)) {
                return devices.map((device: any) => ({
                    id: device.id,
                    userId: device.user_id,
                    deviceHash: device.device_hash,
                    status: device.status,
                    phoneNumber: device.phone_number,
                    containerInfo: {
                        containerId: device.container_id,
                        port: device.container_port
                    },
                    webhookUrl: device.webhook_url,
                    webhookSecret: device.webhook_secret,
                    statusWebhookUrl: device.status_webhook_url,
                    statusWebhookSecret: device.status_webhook_secret,
                    createdAt: device.created_at,
                    updatedAt: device.updated_at,
                    lastSeen: device.last_seen
                }));
            } else {
                logger.warn('findAll() did not return an array of devices');
                return [];
            }
        } catch (error) {
            logger.error('Error listing devices:', error);
            throw error;
        }
    }

    /**
     * Get all devices
     * @returns {Promise<Array>} - Array of devices
     */
    async getAllDevices() {
        try {
            const devices = await deviceRepository.findAll();
            if (Array.isArray(devices)) {
                return devices.map((device: any) => ({
                    id: device.id,
                    userId: device.user_id,
                    deviceHash: device.device_hash,
                    status: device.status,
                    phoneNumber: device.phone_number,
                    containerInfo: {
                        containerId: device.container_id,
                        port: device.container_port
                    },
                    webhookUrl: device.webhook_url,
                    webhookSecret: device.webhook_secret,
                    statusWebhookUrl: device.status_webhook_url,
                    statusWebhookSecret: device.status_webhook_secret,
                    createdAt: device.created_at,
                    updatedAt: device.updated_at,
                    lastSeen: device.last_seen
                }));
            } else {
                logger.warn('findAll() did not return an array of devices');
                return [];
            }
        } catch (error) {
            logger.error('Error listing devices:', error);
            throw error;
        }
    }

    /**
     * Get statistics
     * @returns {Promise<Object>} - Device statistics
     */
    async getStats() {
        try {
            const stats = await deviceRepository.getStatistics();
            return stats;
        } catch (error) {
            logger.error('Error getting statistics:', error);
            throw error;
        }
    }

}

const deviceManager = new DeviceManager();
export default deviceManager;
