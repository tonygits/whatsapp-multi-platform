import express, {Request, Response} from "express";
import {asyncHandler, CustomError} from "../middleware/errorHandler";
import deviceManager from "../services/deviceManager";
import binaryManager from "../services/binaryManager";
import {AuthenticatedRequest} from "../types/session";
import DeviceUtils from "../utils/deviceUtils";
import logger from "../utils/logger";

const router = express.Router();

/**
 * GET /api/devices
 * List all devices
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const {status, limit, offset} = req.query;
    const {id} = req.params;

    let devices;
    const statusStr = status as string[];
    const  userId = id
    if (statusStr) {
        devices = await deviceManager.getUserDevicesByStatus(userId, statusStr);
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

export default router;
