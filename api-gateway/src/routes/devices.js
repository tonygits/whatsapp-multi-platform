const express = require('express');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const deviceManager = require('../services/newDeviceManager');
const binaryManager = require('../services/binaryManager');
const DeviceRepository = require('../repositories/DeviceRepository');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');
const resolveInstance = require('../middleware/resolveInstance');

const router = express.Router();

/**
 * GET /api/devices
 * List all devices (with masked phone numbers)
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
      const phone = device.phoneNumber;
      const process = await binaryManager.getProcessStatus(phone);
      const containerPort = device.port || device.containerInfo?.port || process?.port || null;
      const containerId = device.containerInfo?.containerId || null;
      const qrPresent = Boolean(device.qrCode);
      const messagesWebhookUrl = device.webhookUrl || null;
      const statusWebhookUrl = device.statusWebhookUrl || null;
      const webhookConfigured = Boolean(messagesWebhookUrl);
      const statusWebhookConfigured = Boolean(statusWebhookUrl);

      return {
        id: device.id,
        deviceHash: device.deviceHash,
        phoneNumber: PhoneUtils.maskPhoneNumber(phone, { forceMask: false }),
        name: device.name,
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
        qr: {
          present: qrPresent,
          expiresAt: device.qrExpiresAt || null
        },
        createdAt: device.createdAt || null,
        updatedAt: device.updatedAt || null,
        lastSeen: device.lastSeen || null,
        retryCount: device.retryCount || 0,
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
 * Register a new device (idempotent)
 */
router.post('/', asyncHandler(async (req, res) => {
  const { phoneNumber, name, autoStart = true, webhookUrl, webhookSecret, statusWebhookUrl, statusWebhookSecret } = req.body;

  if (!phoneNumber) {
    throw new CustomError('Número de telefone é obrigatório', 400, 'MISSING_PHONE_NUMBER');
  }

  if (!PhoneUtils.validatePhoneNumber(phoneNumber)) {
    throw new CustomError('Formato de número de telefone inválido', 400, 'INVALID_PHONE_FORMAT');
  }

  logger.info(`Iniciando registro para: ${phoneNumber}`);

  try {
    let device = await deviceManager.getDevice(phoneNumber);
    let process = await binaryManager.getProcessStatus(phoneNumber);
    let wasCreated = false;

    // Scenario 1: Device does not exist in DB
    if (!device) {
      logger.info(`Dispositivo ${phoneNumber} não encontrado no DB. Criando...`);
      device = await deviceManager.registerDevice(phoneNumber, { 
        name, 
        webhookUrl, 
        webhookSecret,
        statusWebhookUrl,
        statusWebhookSecret
      });
      wasCreated = true;
    } else {
      logger.info(`Dispositivo ${phoneNumber} já existe no DB.`);
    }

    // Scenario 2: Process does not exist
    if (!process) {
      logger.info(`Processo para ${phoneNumber} não encontrado. Iniciando...`);
      if (autoStart) {
        process = await binaryManager.startProcess(phoneNumber);
      }
    } else {
      logger.info(`Processo para ${phoneNumber} já existe.`);
      // Ensure process is started if autoStart is requested
      if (autoStart && process.status !== 'running') {
        logger.info(`Processo para ${phoneNumber} não está rodando. Iniciando...`);
        await binaryManager.startProcess(phoneNumber);
      }
    }
    
    // Final state
    const finalDeviceState = await deviceManager.getDevice(phoneNumber);
    const finalProcessState = await binaryManager.getProcessStatus(phoneNumber);
    const phoneHash = PhoneUtils.hashPhoneNumber(phoneNumber);

    logger.info(`Registro para ${phoneNumber} concluído com sucesso.`);

    res.status(wasCreated ? 201 : 200).json({
      success: true,
      message: `Dispositivo ${wasCreated ? 'registrado' : 'já existente'} e verificado com sucesso.`,
      data: {
        deviceHash: finalDeviceState.deviceHash || PhoneUtils.generateDeviceId(phoneNumber),
        phoneNumber: phoneNumber, // Return original number
        phoneHash: phoneHash,
        name: finalDeviceState.name,
        status: finalDeviceState.status,
        processInfo: finalProcessState
      }
    });

  } catch (error) {
    logger.error(`Erro catastrófico ao registrar dispositivo ${phoneNumber}:`, error);
    // Avoid cleanup logic here as it can cause more state issues.
    // The idempotent nature of the endpoint should allow for safe retries.
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

  // Filter allowed updates (não permitir alteração de phone_number, hashes, etc.)
  const allowedFields = ['name', 'webhookUrl', 'webhookSecret', 'statusWebhookUrl', 'statusWebhookSecret'];
  const filteredUpdates = {};
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = value;
    }
  }

  const updatedDevice = await DeviceRepository.update(device.id, filteredUpdates);

  logger.info(`Dispositivo ${PhoneUtils.maskForLog(device.phoneNumber, 'info')} atualizado`);

  res.json({
    success: true,
    message: 'Dispositivo atualizado com sucesso',
    data: {
      deviceHash: updatedDevice.deviceHash,
      phoneNumber: PhoneUtils.maskPhoneNumber(updatedDevice.phoneNumber, { forceMask: false }),
      name: updatedDevice.name,
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

  logger.info(`Removendo dispositivo: ${PhoneUtils.maskForLog(device.phoneNumber, 'info')}`);

  try {
    // Stop process first
    try {
      await binaryManager.stopProcess(device.phoneNumber);
    } catch (error) {
      if (!force) throw error;
      logger.warn(`Erro ao parar processo, mas continuando devido ao force=true: ${error.message}`);
    }

    // Remove from device manager
    const removed = await deviceManager.removeDevice(device.phoneNumber);

    if (!removed) {
      throw new CustomError(
        'Erro ao remover dispositivo',
        500,
        'REMOVAL_ERROR'
      );
    }

    logger.info(`Dispositivo ${PhoneUtils.maskForLog(device.phoneNumber, 'info')} removido com sucesso`);

    res.json({
      success: true,
      message: 'Dispositivo removido com sucesso'
    });

  } catch (error) {
    logger.error(`Erro ao remover dispositivo ${PhoneUtils.maskForLog(device.phoneNumber, 'error')}:`, error);
    throw error;
  }
}));



/**
 * GET /api/devices/info
 * Get specific device information by instance ID
 */
router.get('/info', resolveInstance, asyncHandler(async (req, res) => {
  const { device } = req;
  const phone = device.phoneNumber;
  const process = await binaryManager.getProcessStatus(phone);
  const containerPort = device.containerInfo?.port || process?.port || null;
  const containerId = device.containerInfo?.containerId || null;
  const messagesWebhookUrl = device.webhookUrl || null;
  const statusWebhookUrl = device.statusWebhookUrl || null;

  res.json({
    success: true,
    data: {
      id: device.id,
      deviceHash: device.deviceHash,
      phoneNumber: PhoneUtils.maskPhoneNumber(phone, { forceMask: false }),
      name: device.name,
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
      qr: {
        present: Boolean(device.qrCode),
        value: device.qrCode || null,
        expiresAt: device.qrExpiresAt || null
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

  logger.info(`Iniciando container para ${PhoneUtils.maskForLog(device.phoneNumber, 'info')}`);

  await binaryManager.startProcess(device.phoneNumber);

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

  logger.info(`Parando container para ${PhoneUtils.maskForLog(device.phoneNumber, 'info')}`);

  await binaryManager.stopProcess(device.phoneNumber);

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

  logger.info(`Reiniciando container para ${PhoneUtils.maskForLog(device.phoneNumber, 'info')}`);

  await binaryManager.restartProcess(device.phoneNumber);

  res.json({
    success: true,
    message: 'Processo reiniciado com sucesso'
  });
}));

module.exports = router;