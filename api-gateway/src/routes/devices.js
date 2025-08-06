const express = require('express');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const deviceManager = require('../services/newDeviceManager');
const containerManager = require('../services/containerManager');
const DeviceRepository = require('../repositories/DeviceRepository');
const qrcode = require('qrcode');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');

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
      const containerStatus = await containerManager.getContainerStatus(device.phoneNumber || device.phone_number);
      return {
        id: device.id,
        deviceHash: device.device_hash,
        phoneNumber: PhoneUtils.maskPhoneNumber(device.phoneNumber || device.phone_number, { forceMask: false }),
        name: device.name,
        status: device.status,
        containerStatus,
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

  // Validate and normalize phone number
  if (!PhoneUtils.validatePhoneNumber(phoneNumber)) {
    throw new CustomError(
      'Formato de número de telefone inválido',
      400,
      'INVALID_PHONE_FORMAT'
    );
  }

  const normalizedPhone = PhoneUtils.normalizePhoneNumber(phoneNumber);
  
  logger.info(`Registrando novo dispositivo: ${PhoneUtils.maskForLog(normalizedPhone, 'info')}`);

  try {
    // Register device with masked logging
    const device = await deviceManager.registerDevice(normalizedPhone, { name });

    // Create container
    const containerInfo = await containerManager.createContainer(normalizedPhone);

    if (autoStart) {
      await containerManager.startContainer(normalizedPhone);
    }

    logger.info(`Dispositivo ${PhoneUtils.maskForLog(normalizedPhone, 'info')} registrado e container criado`);

    const phoneHash = PhoneUtils.hashPhoneNumber(normalizedPhone);

    res.status(201).json({
      success: true,
      message: 'Dispositivo registrado com sucesso',
      data: {
        deviceHash: device.device_hash,
        phoneNumber: phoneNumber, // Retorna o número original
        phoneHash: phoneHash, // Retorna o hash do número normalizado
        name: device.name,
        status: device.status,
        containerInfo
      }
    });

  } catch (error) {
    logger.error(`Erro ao registrar dispositivo ${PhoneUtils.maskForLog(normalizedPhone, 'error')}:`, error);
    
    // Cleanup on error
    try {
      await deviceManager.removeDevice(normalizedPhone);
      await containerManager.removeContainer(normalizedPhone, true);
    } catch (cleanupError) {
      logger.error('Erro na limpeza após falha:', cleanupError);
    }
    
    throw error;
  }
}));

/**
 * GET /api/devices/:deviceHash
 * Get specific device information by hash
 */
router.get('/:deviceHash', asyncHandler(async (req, res) => {
  const { deviceHash } = req.params;
  
  const device = await DeviceRepository.findByDeviceHash(deviceHash);
  
  if (!device) {
    throw new CustomError(
      'Dispositivo não encontrado',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  const containerStatus = await containerManager.getContainerStatus(device.phone_number);

  res.json({
    success: true,
    data: {
      id: device.id,
      deviceHash: device.device_hash,
      phoneNumber: PhoneUtils.maskPhoneNumber(device.phone_number, { forceMask: false }),
      name: device.name,
      status: device.status,
      containerStatus,
      qrCode: device.qr_code,
      lastSeen: device.last_seen,
      createdAt: device.created_at
    }
  });
}));

/**
 * PUT /api/devices/:deviceHash
 * Update device information
 */
router.put('/:deviceHash', asyncHandler(async (req, res) => {
  const { deviceHash } = req.params;
  const updates = req.body;

  const device = await DeviceRepository.findByDeviceHash(deviceHash);
  
  if (!device) {
    throw new CustomError(
      'Dispositivo não encontrado',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  // Filter allowed updates (não permitir alteração de phone_number, hashes, etc.)
  const allowedFields = ['name', 'webhook_url'];
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
 * DELETE /api/devices/:deviceHash
 * Remove device
 */
router.delete('/:deviceHash', asyncHandler(async (req, res) => {
  const { deviceHash } = req.params;
  const { force = false } = req.query;

  const device = await DeviceRepository.findByDeviceHash(deviceHash);
  
  if (!device) {
    throw new CustomError(
      'Dispositivo não encontrado',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  logger.info(`Removendo dispositivo: ${PhoneUtils.maskForLog(device.phone_number, 'info')}`);

  try {
    // Remove container first
    await containerManager.removeContainer(device.phone_number, force);

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
 * POST /api/devices/:deviceHash/start
 * Start device container
 */
router.post('/:deviceHash/start', asyncHandler(async (req, res) => {
  const { deviceHash } = req.params;

  const device = await DeviceRepository.findByDeviceHash(deviceHash);
  
  if (!device) {
    throw new CustomError(
      'Dispositivo não encontrado',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  logger.info(`Iniciando container para ${PhoneUtils.maskForLog(device.phone_number, 'info')}`);

  await containerManager.startContainer(device.phone_number);

  res.json({
    success: true,
    message: 'Container iniciado com sucesso'
  });
}));

/**
 * POST /api/devices/:deviceHash/stop
 * Stop device container
 */
router.post('/:deviceHash/stop', asyncHandler(async (req, res) => {
  const { deviceHash } = req.params;

  const device = await DeviceRepository.findByDeviceHash(deviceHash);
  
  if (!device) {
    throw new CustomError(
      'Dispositivo não encontrado',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  logger.info(`Parando container para ${PhoneUtils.maskForLog(device.phone_number, 'info')}`);

  await containerManager.stopContainer(device.phone_number);

  res.json({
    success: true,
    message: 'Container parado com sucesso'
  });
}));

/**
 * POST /api/devices/:deviceHash/restart
 * Restart device container
 */
router.post('/:deviceHash/restart', asyncHandler(async (req, res) => {
  const { deviceHash } = req.params;

  const device = await DeviceRepository.findByDeviceHash(deviceHash);
  
  if (!device) {
    throw new CustomError(
      'Dispositivo não encontrado',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  logger.info(`Reiniciando container para ${PhoneUtils.maskForLog(device.phone_number, 'info')}`);

  await containerManager.restartContainer(device.phone_number);

  res.json({
    success: true,
    message: 'Container reiniciado com sucesso'
  });
}));

/**
 * GET /api/devices/:deviceHash/qr
 * Get QR code for device
 */
router.get('/:deviceHash/qr', asyncHandler(async (req, res) => {
  const { deviceHash } = req.params;

  const device = await DeviceRepository.findByDeviceHash(deviceHash);
  
  if (!device) {
    throw new CustomError(
      'Dispositivo não encontrado',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  if (!device.qr_code) {
    // Try to get QR from container
    try {
      const containerStatus = await containerManager.getContainerStatus(device.phone_number);
      if (containerStatus && containerStatus.qr) {
        // Generate QR code image
        const qrDataUrl = await qrcode.toDataURL(containerStatus.qr);
        
        res.json({
          success: true,
          data: {
            qr: containerStatus.qr,
            qrImage: qrDataUrl,
            expiresAt: containerStatus.qrExpires || null,
            status: device.status
          }
        });
        return;
      }
    } catch (error) {
      logger.error('Erro ao obter QR do container:', error);
    }

    throw new CustomError(
      'QR Code não disponível para este dispositivo',
      404,
      'QR_NOT_AVAILABLE'
    );
  }

  // Generate QR code image from stored data
  const qrDataUrl = await qrcode.toDataURL(device.qr_code);

  res.json({
    success: true,
    data: {
      qr: device.qr_code,
      qrImage: qrDataUrl,
      expiresAt: device.qr_expires_at,
      status: device.status
    }
  });
}));

/**
 * POST /api/devices/:deviceHash/refresh-qr
 * Force refresh QR code
 */
router.post('/:deviceHash/refresh-qr', asyncHandler(async (req, res) => {
  const { deviceHash } = req.params;

  const device = await DeviceRepository.findByDeviceHash(deviceHash);
  
  if (!device) {
    throw new CustomError(
      'Dispositivo não encontrado',
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  // Force refresh QR by requesting new one from container
  try {
    const refreshResult = await containerManager.refreshQR(device.phone_number);
    
    if (refreshResult && refreshResult.qr) {
      const qrDataUrl = await qrcode.toDataURL(refreshResult.qr);
      
      res.json({
        success: true,
        message: 'QR Code atualizado com sucesso',
        data: {
          qr: refreshResult.qr,
          qrImage: qrDataUrl,
          expiresAt: refreshResult.expiresAt || null
        }
      });
    } else {
      throw new CustomError(
        'Não foi possível obter novo QR Code',
        500,
        'QR_REFRESH_FAILED'
      );
    }
  } catch (error) {
    logger.error(`Erro ao atualizar QR para dispositivo ${PhoneUtils.maskForLog(device.phone_number, 'error')}:`, error);
    throw new CustomError(
      'Erro ao atualizar QR Code',
      500,
      'QR_REFRESH_ERROR'
    );
  }
}));

module.exports = router;