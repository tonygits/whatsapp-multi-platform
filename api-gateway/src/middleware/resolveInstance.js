const { asyncHandler, CustomError } = require('./errorHandler');
const deviceManager = require('../services/newDeviceManager');
const DeviceRepository = require('../repositories/DeviceRepository');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');

// Core resolver reused by both middlewares
const resolveInstanceCore = async (instanceId) => {
  // Try to find device by phone number or device_hash
  let device = await deviceManager.getDevice(instanceId);

  if (!device) {
    const dbDevice = await DeviceRepository.findByDeviceHash(instanceId);
    if (dbDevice) {
      device = {
        id: dbDevice.id,
        deviceHash: dbDevice.device_hash,
        phoneNumber: dbDevice.phone_number,
        name: dbDevice.name,
        status: dbDevice.status,
        containerInfo: {
          containerId: dbDevice.container_id,
          port: dbDevice.container_port
        },
        qrCode: dbDevice.qr_code,
        qrExpiresAt: dbDevice.qr_expires_at,
        webhookUrl: dbDevice.webhook_url,
        webhookSecret: dbDevice.webhook_secret,
        statusWebhookUrl: dbDevice.status_webhook_url,
        statusWebhookSecret: dbDevice.status_webhook_secret,
        createdAt: dbDevice.created_at,
        updatedAt: dbDevice.updated_at,
        lastSeen: dbDevice.last_seen
      };
    }
  }

  return device;
};

/**
 * resolveInstance: apenas resolve o dispositivo e anexa em req.device
 */
const resolveInstance = asyncHandler(async (req, res, next) => {
  const instanceId = req.body.instance_id || req.query.instance_id || req.headers['x-instance-id'];

  if (!instanceId) {
    throw new CustomError(
      'x-instance-id header é obrigatório',
      400,
      'MISSING_INSTANCE_ID'
    );
  }

  const device = await resolveInstanceCore(instanceId);

  if (!device) {
    throw new CustomError(
      `Dispositivo com instance ID ${PhoneUtils.maskForLog(instanceId, 'error')} não encontrado`,
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  req.device = device;
  req.instanceId = instanceId;
  next();
});

/**
 * ensureActive: valida que o dispositivo está ativo (ou waiting_qr quando aplicável)
 */
const ensureActive = asyncHandler(async (req, res, next) => {
  const device = req.device;
  if (!device) {
    throw new CustomError('Dispositivo não resolvido', 500, 'DEVICE_NOT_RESOLVED');
  }

  if (device.status !== 'active' && device.status !== 'waiting_qr') {
    throw new CustomError(
      `Dispositivo com instance ID ${PhoneUtils.maskForLog(req.instanceId || device.phoneNumber, 'error')} não está ativo. Status atual: ${device.status}`,
      400,
      'DEVICE_NOT_ACTIVE'
    );
  }

  next();
});

// Export default with helper attached para compatibilidade
resolveInstance.ensureActive = ensureActive;

module.exports = resolveInstance;