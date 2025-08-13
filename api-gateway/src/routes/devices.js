const express = require('express');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const deviceManager = require('../services/newDeviceManager');
const binaryManager = require('../services/binaryManager');
const DeviceRepository = require('../repositories/DeviceRepository');
const logger = require('../utils/logger');
const DeviceUtils = require('../utils/deviceUtils');
const resolveInstance = require('../middleware/resolveInstance');

const router = express.Router();

/**
 * GET /api/devices
 * List all devices
 */
router.get('/', asyncHandler(async (req, res) => {
  const { status, limit, offset } = req.query;
  
  let devices;
  
  if (status) {
    devices = await deviceManager.getDevicesByStatus(status);
  } else {
    devices = await deviceManager.getAllDevices();
  }

  // Convert to array and apply pagination
  const devicesArray = Object.values(devices);
  const total = devicesArray.length;
  
  let paginatedDevices = devicesArray;
  if (limit) {
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset) || 0;
    paginatedDevices = devicesArray.slice(offsetNum, offsetNum + limitNum);
  }

  // Add container/process status e enriquecer dados de saída
  const devicesWithStatus = await Promise.all(
    paginatedDevices.map(async (device) => {
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
        limit: parseInt(limit) || total,
        offset: parseInt(offset) || 0,
        hasMore: limit ? (parseInt(offset) || 0) + parseInt(limit) < total : false
      }
    }
  });
}));

/**
 * POST /api/devices
 * Register a new device (generates deviceHash automatically)
 */
router.post('/', asyncHandler(async (req, res) => {
  const { autoStart = true, webhookUrl, webhookSecret, statusWebhookUrl, statusWebhookSecret } = req.body;

  // Generate unique device hash
  const deviceHash = DeviceUtils.generateDeviceHash();
  
  logger.info(`Iniciando registro para novo dispositivo: ${deviceHash}`);

  try {
    // Create device in DB
    await deviceManager.registerDevice(deviceHash, { 
      webhookUrl, 
      webhookSecret,
      statusWebhookUrl,
      statusWebhookSecret
    });

    logger.info(`Dispositivo ${deviceHash} criado no DB.`);

    // Start process if requested
    let process = null;
    if (autoStart) {
      logger.info(`Iniciando processo para ${deviceHash}...`);
      try {
        process = await binaryManager.startProcess(deviceHash);
      } catch (processError) {
        logger.warn(`Erro ao iniciar processo para ${deviceHash}, mas dispositivo foi criado:`, processError.message);
      }
    }
    
    // Get final state
    const finalDeviceState = await deviceManager.getDevice(deviceHash);
    const finalProcessState = process || await binaryManager.getProcessStatus(deviceHash);

    logger.info(`Registro para ${deviceHash} concluído com sucesso.`);

    res.status(201).json({
      success: true,
      message: 'Dispositivo registrado com sucesso.',
      data: {
        deviceHash: finalDeviceState.deviceHash,
        status: finalDeviceState.status,
        processInfo: finalProcessState
      }
    });

  } catch (error) {
    logger.error(`Erro catastrófico ao registrar dispositivo ${deviceHash}:`, error);
    throw new CustomError('Ocorreu um erro inesperado durante o registro.', 500, 'REGISTRATION_UNEXPECTED_ERROR');
  }
}));

/**
 * PUT /api/devices
 * Update device information by instance ID
 */
router.put('/', resolveInstance, asyncHandler(async (req, res) => {
  const { device } = req;
  const updates = req.body;

  // Filter allowed updates (não permitir alteração de hashes, etc.)
  const allowedFields = ['webhookUrl', 'webhookSecret', 'statusWebhookUrl', 'statusWebhookSecret'];
  const filteredUpdates = {};
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = value;
    }
  }

  const updatedDevice = await DeviceRepository.update(device.id, filteredUpdates);

  logger.info(`Dispositivo ${device.deviceHash} atualizado`);

  res.json({
    success: true,
    message: 'Dispositivo atualizado com sucesso',
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
router.delete('/', resolveInstance, asyncHandler(async (req, res) => {
  const { device } = req;
  const { force = false } = req.query;

  logger.info(`Removendo dispositivo: ${device.device_hash}`);

  try {
    // Stop process first
    try {
      await binaryManager.stopProcess(device.device_hash);
    } catch (error) {
      if (!force) throw error;
      logger.warn(`Erro ao parar processo, mas continuando devido ao force=true: ${error.message}`);
    }

    // Remove from device manager
    const removed = await deviceManager.removeDevice(device.device_hash);

    if (!removed) {
      throw new CustomError(
        'Erro ao remover dispositivo',
        500,
        'REMOVAL_ERROR'
      );
    }

    logger.info(`Dispositivo ${device.device_hash} removido com sucesso`);

    res.json({
      success: true,
      message: 'Dispositivo removido com sucesso'
    });

  } catch (error) {
    logger.error(`Erro ao remover dispositivo ${device.device_hash}:`, error);
    throw error;
  }
}));



/**
 * GET /api/devices/info
 * Get specific device information by instance ID
 */
router.get('/info', resolveInstance, asyncHandler(async (req, res) => {
  const { device } = req;
  const process = await binaryManager.getProcessStatus(device.device_hash);
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
      container: { id: containerId, port: containerPort },
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
router.post('/start', resolveInstance, asyncHandler(async (req, res) => {
  const { device } = req;

  logger.info(`Iniciando container para ${device.device_hash}`);

  await binaryManager.startProcess(device.device_hash);

  res.json({
    success: true,
    message: 'Processo iniciado com sucesso'
  });
}));

/**
 * POST /api/devices/stop
 * Stop device container by instance ID
 */
router.post('/stop', resolveInstance, asyncHandler(async (req, res) => {
  const { device } = req;

  logger.info(`Parando container para ${device.device_hash}`);

  await binaryManager.stopProcess(device.device_hash);

  res.json({
    success: true,
    message: 'Processo parado com sucesso'
  });
}));

/**
 * POST /api/devices/restart
 * Restart device container by instance ID
 */
router.post('/restart', resolveInstance, asyncHandler(async (req, res) => {
  const { device } = req;

  logger.info(`Reiniciando container para ${device.device_hash}`);

  await binaryManager.restartProcess(device.device_hash);

  res.json({
    success: true,
    message: 'Processo reiniciado com sucesso'
  });
}));

module.exports = router;