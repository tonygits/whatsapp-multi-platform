import express, {Request, Response} from 'express';
import {asyncHandler, CustomError} from '../middleware/errorHandler';
import deviceManager from '../services/deviceManager';
import binaryManager from '../services/binaryManager';
import DeviceRepository from '../repositories/DeviceRepository';
import logger from '../utils/logger';
import resolveInstance from "../middleware/resolveInstance";

const router = express.Router();

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
    logger.info(`Phone number ${device.numberHash} updated`);

    res.json({
        success: true,
        message: 'Phone number updated successfully',
        data: {
            numberHash: updatedDevice.device_hash,
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

    logger.info(`Removing phone number: ${device.numberHash}`);

    try {
        // Stop process first
        try {
            await binaryManager.stopProcess(device.numberHash);
        } catch (error) {
            if (!force) throw error;
            logger.warn(`Error stopping process, but continuing due to force=true: ${(error as any)?.message}`);
        }

        // Remove from device manager
        const removed = await deviceManager.removeDevice(device.numberHash);
        if (!removed) {
            throw new CustomError(
                'Error removing phone number',
                500,
                'REMOVAL_ERROR'
            );
        }

        logger.info(`Phone number ${device.numberHash} successfully removed`);

        res.json({
            success: true,
            message: 'Phone number removed successfully'
        });

    } catch (error) {
        logger.error(`Error removing phone number ${device.numberHash}:`, error);
        throw error;
    }
}));


/**
 * GET /api/devices/info
 * Get specific device information by instance ID
 */
router.get('/info', resolveInstance, asyncHandler(async (req: Request, res: Response) => {
    console.log('Received request for phone number info');
    const device = (req as any).device;
    const process = await binaryManager.getProcessStatus(device.numberHash);
    const containerPort = device.containerInfo?.port || process?.port || null;
    const containerId = device.containerInfo?.containerId || null;
    const messagesWebhookUrl = device.webhookUrl || null;
    const statusWebhookUrl = device.statusWebhookUrl || null;

    res.json({
        success: true,
        data: {
            id: device.id,
            numberHash: device.numberHash,
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
 * POST /api/devices/start *  device container by instance ID
 */
router.post('/start', resolveInstance, asyncHandler(async (req: Request, res: Response) => {
    console.log('Received request to start phone number');
    const device = (req as any).device;

    logger.info(`Starting container for ${device.numberHash}`);

    await binaryManager.startProcess(device.numberHash);

    res.json({
        success: true,
        message: 'Process started successfully'
    });
}));

/**
 * POST /api/devices/stop *  device container by instance ID
 */
router.post('/stop', resolveInstance, asyncHandler(async (req: Request, res: Response) => {
    console.log('Received request to stop device');
    const device = (req as any).device;

    logger.info(`Stopping container for ${device.numberHash}`);

    await binaryManager.stopProcess(device.numberHash);

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
    console.log('Received request to restart phone number');
    const device = (req as any).device;

    logger.info(`Restarting container for ${device.numberHash}`);

    await binaryManager.restartProcess(device.numberHash);
    res.json({
        success: true,
        message: 'Process restarted successfully'
    });
}));

export default router;
