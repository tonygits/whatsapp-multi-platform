const express = require('express');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const deviceManager = require('../services/newDeviceManager');
const binaryManager = require('../services/binaryManager');
const DeviceRepository = require('../repositories/DeviceRepository');
const qrcode = require('qrcode');
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

  // Add container status and mask phone numbers
  const devicesWithStatus = await Promise.all(
    paginatedDevices.map(async (device) => {
      const processStatus = await binaryManager.getProcessStatus(device.phoneNumber || device.phone_number);
      return {
        id: device.id,
        deviceHash: device.device_hash,
        phoneNumber: PhoneUtils.maskPhoneNumber(device.phoneNumber || device.phone_number, { forceMask: false }),
        name: device.name,
        status: device.status,
        processStatus,
        lastSeen: device.last_seen,
        createdAt: device.created_at,
        retryCount: device.retry_count || 0
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
  const { phoneNumber, name, autoStart = true, webhook, webhookSecret } = req.body;

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
      device = await deviceManager.registerDevice(phoneNumber, { name, webhook_url: webhook, webhook_secret: webhookSecret });
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
        deviceHash: finalDeviceState.device_hash || PhoneUtils.generateDeviceId(phoneNumber),
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
 * GET /api/devices/info
 * Get specific device information by instance ID
 */
router.get('/info', resolveInstance, asyncHandler(async (req, res) => {
  const { device } = req;

  const processStatus = await binaryManager.getProcessStatus(device.phone_number);

  res.json({
    success: true,
    data: {
      id: device.id,
      deviceHash: device.device_hash,
      phoneNumber: PhoneUtils.maskPhoneNumber(device.phone_number, { forceMask: false }),
      name: device.name,
      status: device.status,
      processStatus,
      qrCode: device.qr_code,
      lastSeen: device.last_seen,
      createdAt: device.created_at
    }
  });
}));

/**
 * PUT /api/devices/info
 * Update device information by instance ID
 */
router.put('/info', resolveInstance, asyncHandler(async (req, res) => {
  const { device } = req;
  const updates = req.body;

  // Filter allowed updates (não permitir alteração de phone_number, hashes, etc.)
  const allowedFields = ['name', 'webhook_url', 'webhook_secret'];
  const filteredUpdates = {};
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = value;
    }
  }

  const updatedDevice = await DeviceRepository.update(device.id, filteredUpdates);

  logger.info(`Dispositivo ${PhoneUtils.maskForLog(device.phone_number, 'info')} atualizado`);

  res.json({
    success: true,
    message: 'Dispositivo atualizado com sucesso',
    data: {
      deviceHash: updatedDevice.device_hash,
      phoneNumber: PhoneUtils.maskPhoneNumber(updatedDevice.phone_number, { forceMask: false }),
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

  logger.info(`Removendo dispositivo: ${PhoneUtils.maskForLog(device.phone_number, 'info')}`);

  try {
    // Stop process first
    try {
      await binaryManager.stopProcess(device.phone_number);
    } catch (error) {
      if (!force) throw error;
      logger.warn(`Erro ao parar processo, mas continuando devido ao force=true: ${error.message}`);
    }

    // Remove from device manager
    const removed = await deviceManager.removeDevice(device.phone_number);

    if (!removed) {
      throw new CustomError(
        'Erro ao remover dispositivo',
        500,
        'REMOVAL_ERROR'
      );
    }

    logger.info(`Dispositivo ${PhoneUtils.maskForLog(device.phone_number, 'info')} removido com sucesso`);

    res.json({
      success: true,
      message: 'Dispositivo removido com sucesso'
    });

  } catch (error) {
    logger.error(`Erro ao remover dispositivo ${PhoneUtils.maskForLog(device.phone_number, 'error')}:`, error);
    throw error;
  }
}));

/**
 * POST /api/devices/start
 * Start device container by instance ID
 */
router.post('/start', resolveInstance, asyncHandler(async (req, res) => {
  const { device } = req;

  logger.info(`Iniciando container para ${PhoneUtils.maskForLog(device.phone_number, 'info')}`);

  await binaryManager.startProcess(device.phone_number);

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

  logger.info(`Parando container para ${PhoneUtils.maskForLog(device.phone_number, 'info')}`);

  await binaryManager.stopProcess(device.phone_number);

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

  logger.info(`Reiniciando container para ${PhoneUtils.maskForLog(device.phone_number, 'info')}`);

  await binaryManager.restartProcess(device.phone_number);

  res.json({
    success: true,
    message: 'Processo reiniciado com sucesso'
  });
}));

module.exports = router;