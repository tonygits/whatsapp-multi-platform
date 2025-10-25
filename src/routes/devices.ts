import resolveInstance from '../middleware/resolveInstance';

import express, {Request, Response} from 'express';
import {asyncHandler, CustomError} from '../middleware/errorHandler';
import deviceManager from '../services/deviceManager';
import binaryManager from '../services/binaryManager';
import DeviceRepository from '../repositories/DeviceRepository';
import logger from '../utils/logger';
import DeviceUtils from '../utils/deviceUtils';
import {AuthenticatedRequest} from "../types/session";

const router = express.Router();

/**
 * GET /api/devices
 * List all devices
 */
router.get('/users/:id/devices', asyncHandler(async (req: Request, res: Response) => {
    const {status, limit, offset} = req.query;
    const {id} = req.params;

    let devices;
    const statusStr = typeof status === 'string' ? status : Array.isArray(status) ? status[0] : undefined;
    const  userId = id
    if (statusStr) {
        devices = await deviceManager.getUserDevicesByStatus(userId, statusStr as string);
    } else {
        devices = await deviceManager.getUserDevices(userId);
    }

    // Convert to array and apply pagination
    const devicesArray = Object.values(devices);
    const total = devicesArray.length;

    let paginatedDevices = devicesArray;
    const limitStr = typeof limit === 'string' ? limit : Array.isArray(limit) ? limit[0] : undefined;
    const offsetStr = typeof offset === 'string' ? offset : Array.isArray(offset) ? offset[0] : undefined;
    if (limitStr) {
        const limitNum = parseInt(limitStr as string);
        const offsetNum = offsetStr ? parseInt(offsetStr as string) : 0;
        paginatedDevices = devicesArray.slice(offsetNum, offsetNum + limitNum);
    }

// Add container/process status and enrich output data
    const devicesWithStatus = await Promise.all(
        paginatedDevices.map(async (device: any) => {
            const process = await binaryManager.getProcessStatus(device.deviceHash);
            const containerPort = device.port || device.containerInfo?.port || process?.port || null;
            const containerId = device.containerInfo?.containerId || null;
            const messagesWebhookUrl = device.webhookUrl || null;
            const statusWebhookUrl = device.statusWebhookUrl || null;
            const webhookConfigured = Boolean(messagesWebhookUrl);
            const statusWebhookConfigured = Boolean(statusWebhookUrl);

            return {
                id: device.id,
                deviceHash: device.deviceHash,
                status: device.status,
                phoneNumber: device.phoneNumber,
                container: {
                    id: containerId,
                    port: containerPort
                },
                process: process || null,
                webhooks: {
                    messages: webhookConfigured,
                    status: statusWebhookConfigured,
                    messagesUrl: messagesWebhookUrl,
                    statusUrl: statusWebhookUrl,
                    hasMessagesSecret: Boolean(device.webhookSecret),
                    hasStatusSecret: Boolean(device.statusWebhookSecret)
                },
                createdAt: device.createdAt || null,
                updatedAt: device.updatedAt || null,
                lastSeen: device.lastSeen || null,
                endpoints: containerPort ? {
                    restBase: `http://localhost:${containerPort}`,
                    health: `http://localhost:${containerPort}/health`,
                    ws: `ws://localhost:${containerPort}/ws`
                } : null
            };
        })
    );

    res.json({
        success: true,
        data: {
            devices: devicesWithStatus,
            pagination: {
                total,
                limit: limitStr ? parseInt(limitStr as string) : total,
                offset: offsetStr ? parseInt(offsetStr as string) : 0,
                hasMore: limitStr ? (offsetStr ? parseInt(offsetStr as string) : 0) + parseInt(limitStr as string) < total : false
            }
        }
    });
}));

/**
 * POST /api/devices
 * Register a new device (generates deviceHash automatically)
 */
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    console.log("Received request to register new device");

    const {autoStart = true, webhookUrl, webhookSecret, phoneNumber, statusWebhookUrl, statusWebhookSecret} = req.body;

    const userId = req.user?.userId
    // Generate unique device hash
    const deviceHash = DeviceUtils.generateDeviceHash();
    logger.info(`Starting registration for new device: ${deviceHash}`);


    const device = await deviceManager.getDeviceByPhone(phoneNumber);
    if (device) {
        res.status(400).json({
            success: false,
            message: `Device ${phoneNumber} already registered`,
            data: {
                deviceHash: device?.deviceHash ?? deviceHash,
                phoneNumber: device?.phoneNumber ?? phoneNumber,
                status: device?.status ?? 'unknown',
            }
        });
    }

    try {
        // Create device in DB
        await deviceManager.registerDevice(deviceHash, phoneNumber, {
            userId,
            webhookUrl,
            webhookSecret,
            statusWebhookUrl,
            statusWebhookSecret
        });

        logger.info(`Device ${deviceHash} created in DB.`);

        // Start process if requested
        let process = null;
        if (autoStart) {
            logger.info(`Starting process for ${deviceHash}...`);
            try {
                process = await binaryManager.startProcess(deviceHash);
            } catch (processError) {
                logger.warn(`Error starting process for ${deviceHash}, but device was created:`, (processError as any)?.message);
            }
        }

        // Get final state
        const finalDeviceState = await deviceManager.getDevice(deviceHash);
        const finalProcessState = process || await binaryManager.getProcessStatus(deviceHash);

        logger.info(`Registration for ${deviceHash} completed successfully.`);

        res.status(201).json({
            success: true,
            message: 'Device registered successfully.',
            data: {
                userId: finalDeviceState?.userId ?? userId,
                deviceHash: finalDeviceState?.deviceHash ?? deviceHash,
                phoneNumber: finalDeviceState?.phoneNumber ?? phoneNumber,
                status: finalDeviceState?.status ?? 'unknown',
                processInfo: finalProcessState
            }
        });

    } catch (error) {
        logger.error(`Catastrophic error registering device ${deviceHash}:`, error);
        throw new CustomError('An unexpected error occurred during registration.', 500, 'REGISTRATION_UNEXPECTED_ERROR');
    }
}));

/**
 * PUT /api/devices
 * Update device information by instance ID
 */
router.put('/', resolveInstance, asyncHandler(async (req: Request, res: Response) => {
    const device = (req as any).device;
    const updates = req.body;

// Filter allowed updates (do not allow changing hashes, etc.)
    const allowedFields = ['webhookUrl', 'webhookSecret', 'statusWebhookUrl', 'statusWebhookSecret'];
    const filteredUpdates: { [key: string]: any } = {};

    for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
            filteredUpdates[key] = value;
        }
    }

    const updatedDevice = await DeviceRepository.update(device.id, filteredUpdates);

    logger.info(`Device ${device.deviceHash} updated`);

    res.json({
        success: true,
        message: 'Device updated successfully',
        data: {
            deviceHash: updatedDevice.device_hash,
            status: updatedDevice.status
        }
    });
}));

/**
 * DELETE /api/devices
 * Remove device by instance ID
 */
router.delete('/', resolveInstance, asyncHandler(async (req: Request, res: Response) => {
    const device = (req as any).device;
    const {force = false} = req.query;

    logger.info(`Removing device: ${device.deviceHash}`);

    try {
        // Stop process first
        try {
            await binaryManager.stopProcess(device.deviceHash);
        } catch (error) {
            if (!force) throw error;
            logger.warn(`Error stopping process, but continuing due to force=true: ${(error as any)?.message}`);
        }

        // Remove from device manager
        const removed = await deviceManager.removeDevice(device.deviceHash);

        if (!removed) {
            throw new CustomError(
                'Error removing device',
                500,
                'REMOVAL_ERROR'
            );
        }

        logger.info(`Device ${device.deviceHash} successfully removed`);

        res.json({
            success: true,
            message: 'Device removed successfully'
        });

    } catch (error) {
        logger.error(`Error removing device ${device.deviceHash}:`, error);
        throw error;
    }
}));


/**
 * GET /api/devices/info
 * Get specific device information by instance ID
 */
router.get('/info', resolveInstance, asyncHandler(async (req: Request, res: Response) => {
    console.log('Received request for device info');
    const device = (req as any).device;
    const process = await binaryManager.getProcessStatus(device.deviceHash);
    const containerPort = device.containerInfo?.port || process?.port || null;
    const containerId = device.containerInfo?.containerId || null;
    const messagesWebhookUrl = device.webhookUrl || null;
    const statusWebhookUrl = device.statusWebhookUrl || null;

    res.json({
        success: true,
        data: {
            id: device.id,
            deviceHash: device.deviceHash,
            status: device.status,
            phoneNumber: device.phoneNumber,
            container: {id: containerId, port: containerPort},
            process: process || null,
            webhooks: {
                messages: Boolean(messagesWebhookUrl),
                status: Boolean(statusWebhookUrl),
                messagesUrl: messagesWebhookUrl,
                statusUrl: statusWebhookUrl,
                hasMessagesSecret: Boolean(device.webhookSecret),
                hasStatusSecret: Boolean(device.statusWebhookSecret)
            },
            createdAt: device.createdAt || null,
            updatedAt: device.updatedAt || null,
            lastSeen: device.lastSeen || null,
            endpoints: containerPort ? {
                restBase: `http://localhost:${containerPort}`,
                health: `http://localhost:${containerPort}/health`,
                ws: `ws://localhost:${containerPort}/ws`
            } : null
        }
    });
}));

/**
 * POST /api/devices/start
 * Start device container by instance ID
 */
router.post('/start', resolveInstance, asyncHandler(async (req: Request, res: Response) => {
    console.log('Received request to start device');
    const device = (req as any).device;

    logger.info(`Starting container for ${device.deviceHash}`);

    await binaryManager.startProcess(device.deviceHash);

    res.json({
        success: true,
        message: 'Process started successfully'
    });
}));

/**
 * POST /api/devices/stop
 * Stop device container by instance ID
 */
router.post('/stop', resolveInstance, asyncHandler(async (req: Request, res: Response) => {
    console.log('Received request to stop device');
    const device = (req as any).device;

    logger.info(`Stopping container for ${device.deviceHash}`);

    await binaryManager.stopProcess(device.deviceHash);

    res.json({
        success: true,
        message: 'Process stopped successfully'
    });
}));

/**
 * POST /api/devices/restart
 * Restart device container by instance ID
 */
router.post('/restart', resolveInstance, asyncHandler(async (req: Request, res: Response) => {
    console.log('Received request to restart device');
    const device = (req as any).device;

    logger.info(`Restarting container for ${device.deviceHash}`);

    await binaryManager.restartProcess(device.deviceHash);

    res.json({
        success: true,
        message: 'Process restarted successfully'
    });
}));

export default router;
