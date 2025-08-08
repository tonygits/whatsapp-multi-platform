const { asyncHandler, CustomError } = require('./errorHandler');
const deviceManager = require('../services/newDeviceManager');
const DeviceRepository = require('../repositories/DeviceRepository');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');

/**
 * Middleware to extract instance_id and resolve device
 * Attaches the resolved device object to req.device
 * Throws CustomError if instance_id is missing or device not found/active
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

  // Try to find device by phone number or device_hash
  let device = await deviceManager.getDevice(instanceId);
  
  if (!device) {
    // Try by device_hash if not found by phone number
    device = await DeviceRepository.findByDeviceHash(instanceId);
    
    if (device) {
      // Convert database format to device manager format if found by hash
      device = {
        id: device.id,
        phoneNumber: device.phone_number,
        name: device.name,
        status: device.status,
        containerInfo: {
          containerId: device.container_id,
          port: device.container_port
        },
        qrCode: device.qr_code,
        qrExpiresAt: device.qr_expires_at,
        webhookUrl: device.webhook_url,
        createdAt: device.created_at,
        updatedAt: device.updated_at,
        lastSeen: device.last_seen
      };
    }
  }

  if (!device) {
    throw new CustomError(
      `Dispositivo com instance ID ${PhoneUtils.maskForLog(instanceId, 'error')} não encontrado`,
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  // Check if device is active (if applicable, some routes might not need this strict check)
  // For now, we'll keep it as a general check, can be refined per route if needed.
  if (device.status !== 'active' && device.status !== 'waiting_qr') { // Allow waiting_qr for QR routes
    throw new CustomError(
      `Dispositivo com instance ID ${PhoneUtils.maskForLog(instanceId, 'error')} não está ativo. Status atual: ${device.status}`,
      400,
      'DEVICE_NOT_ACTIVE'
    );
  }

  req.device = device; // Attach the full device object to the request
  req.instanceId = instanceId; // Keep instanceId for logging/context
  next();
});

module.exports = resolveInstance;