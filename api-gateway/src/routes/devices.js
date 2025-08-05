const express = require('express');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const deviceManager = require('../services/deviceManager');
const containerManager = require('../services/containerManager');
const qrcode = require('qrcode');
const logger = require('../utils/logger');

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

  // Add container status to each device
  const devicesWithStatus = await Promise.all(
    paginatedDevices.map(async (device) => {
      const containerStatus = await containerManager.getContainerStatus(device.phoneNumber);
      return {
        ...device,
        containerStatus
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
 * Register a new device
 */
router.post('/', asyncHandler(async (req, res) => {
  const { phoneNumber, name, autoStart = true } = req.body;

  if (!phoneNumber) {
    throw new CustomError(
      'Número de telefone é obrigatório',
      400,
      'MISSING_PHONE_NUMBER'
    );
  }

  // Validate phone number format (basic validation)
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(phoneNumber)) {
    throw new CustomError(
      'Formato de número de telefone inválido',
      400,
      'INVALID_PHONE_FORMAT'
    );
  }

  logger.info(`Registrando novo dispositivo: ${phoneNumber}`);

  try {
    // Register device
    const device = await deviceManager.registerDevice(phoneNumber, { name });
    
    // Create container
    const containerInfo = await containerManager.createContainer(phoneNumber);
    
    // Start container if autoStart is true
    if (autoStart) {
      await containerManager.startContainer(phoneNumber);
    }

    logger.info(`Dispositivo ${phoneNumber} registrado e container criado`);

    res.status(201).json({
      success: true,
      message: 'Dispositivo registrado com sucesso',
      data: {
        device,
        container: containerInfo
      }
    });

  } catch (error) {
    // Cleanup on error
    try {
      await deviceManager.removeDevice(phoneNumber);
      await containerManager.removeContainer(phoneNumber, true);
    } catch (cleanupError) {
      logger.error('Erro durante cleanup:', cleanupError);
    }
    throw error;
  }
}));

/**
 * GET /api/devices/:phoneNumber
 * Get specific device information
 */
router.get('/:phoneNumber', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;
  
  const device = await deviceManager.getDevice(phoneNumber);
  
  if (!device) {
    throw new CustomError(
      'Dispositivo não encontrado',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  const containerStatus = await containerManager.getContainerStatus(phoneNumber);

  res.json({
    success: true,
    data: {
      ...device,
      containerStatus
    }
  });
}));

/**
 * PUT /api/devices/:phoneNumber
 * Update device information
 */
router.put('/:phoneNumber', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;
  const updates = req.body;

  // Remove sensitive fields that shouldn't be updated directly
  const allowedFields = ['name', 'status', 'retryCount'];
  const filteredUpdates = {};
  
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  }

  const device = await deviceManager.updateDevice(phoneNumber, filteredUpdates);

  logger.info(`Dispositivo ${phoneNumber} atualizado`);

  res.json({
    success: true,
    message: 'Dispositivo atualizado com sucesso',
    data: device
  });
}));

/**
 * DELETE /api/devices/:phoneNumber
 * Remove device and its container
 */
router.delete('/:phoneNumber', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;
  const { force = false } = req.query;

  logger.info(`Removendo dispositivo: ${phoneNumber}`);

  // Remove container first
  await containerManager.removeContainer(phoneNumber, force);

  // Remove device from config
  const removed = await deviceManager.removeDevice(phoneNumber);

  if (!removed) {
    throw new CustomError(
      'Dispositivo não encontrado',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  logger.info(`Dispositivo ${phoneNumber} removido com sucesso`);

  res.json({
    success: true,
    message: 'Dispositivo removido com sucesso'
  });
}));

/**
 * POST /api/devices/:phoneNumber/start
 * Start device container
 */
router.post('/:phoneNumber/start', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;

  logger.info(`Iniciando container para ${phoneNumber}`);

  await containerManager.startContainer(phoneNumber);

  res.json({
    success: true,
    message: 'Container iniciado com sucesso'
  });
}));

/**
 * POST /api/devices/:phoneNumber/stop
 * Stop device container
 */
router.post('/:phoneNumber/stop', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;

  logger.info(`Parando container para ${phoneNumber}`);

  await containerManager.stopContainer(phoneNumber);

  res.json({
    success: true,
    message: 'Container parado com sucesso'
  });
}));

/**
 * POST /api/devices/:phoneNumber/restart
 * Restart device container
 */
router.post('/:phoneNumber/restart', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;

  logger.info(`Reiniciando container para ${phoneNumber}`);

  await containerManager.restartContainer(phoneNumber);

  res.json({
    success: true,
    message: 'Container reiniciado com sucesso'
  });
}));

/**
 * GET /api/devices/:phoneNumber/qr
 * Get QR code for device authentication
 */
router.get('/:phoneNumber/qr', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;
  
  const device = await deviceManager.getDevice(phoneNumber);
  
  if (!device) {
    throw new CustomError(
      'Dispositivo não encontrado',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  if (!device.qrCode) {
    throw new CustomError(
      'QR Code não está disponível',
      404,
      'QR_CODE_NOT_AVAILABLE'
    );
  }

  // Generate QR code image
  try {
    const qrCodeImage = await qrcode.toDataURL(device.qrCode, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.json({
      success: true,
      data: {
        qrCode: device.qrCode,
        qrCodeImage,
        expiresAt: new Date(Date.now() + 60000).toISOString() // 1 minute
      }
    });
  } catch (error) {
    logger.error('Erro ao gerar QR Code:', error);
    throw new CustomError(
      'Erro ao gerar QR Code',
      500,
      'QR_CODE_GENERATION_ERROR'
    );
  }
}));

/**
 * POST /api/devices/:phoneNumber/refresh-qr
 * Request new QR code for device
 */
router.post('/:phoneNumber/refresh-qr', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;

  // This would trigger the container to generate a new QR code
  // Implementation depends on how the WhatsApp container works
  
  res.json({
    success: true,
    message: 'Solicitação de novo QR Code enviada'
  });
}));

/**
 * GET /api/devices/stats
 * Get devices statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await deviceManager.getStats();
  const containers = await containerManager.listContainers();

  const containerStats = {
    total: containers.length,
    running: containers.filter(c => c.running).length,
    stopped: containers.filter(c => !c.running).length
  };

  res.json({
    success: true,
    data: {
      devices: stats,
      containers: containerStats,
      timestamp: new Date().toISOString()
    }
  });
}));

module.exports = router;