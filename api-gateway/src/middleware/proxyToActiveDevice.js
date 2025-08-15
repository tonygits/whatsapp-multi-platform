const axios = require('axios');
const { asyncHandler, CustomError } = require('./errorHandler');
const deviceManager = require('../services/newDeviceManager');
const DeviceRepository = require('../repositories/DeviceRepository');
const logger = require('../utils/logger');

const DEFAULT_ADMIN_USER = process.env.DEFAULT_ADMIN_USER || 'admin';
const DEFAULT_ADMIN_PASS = process.env.DEFAULT_ADMIN_PASS || 'admin';

/**
 * Simplified middleware that combines:
 * - resolveInstance (find device by deviceHash)
 * - ensureActive (validate device is active/connected)  
 * - proxyToContainer (proxy request to device container)
 * 
 * All in one step for better performance and simplicity
 */
const proxyToActiveDevice = asyncHandler(async (req, res) => {
  // 1. Extract instanceId from header
  const instanceId = req.get('x-instance-id');
  if (!instanceId) {
    throw new CustomError('Header x-instance-id é obrigatório', 400, 'MISSING_INSTANCE_ID');
  }

  // 2. Resolve device (combines resolveInstance logic)
  let device = await deviceManager.getDevice(instanceId);
  
  if (!device) {
    const dbDevice = await DeviceRepository.findByDeviceHash(instanceId);
    if (dbDevice) {
      device = {
        id: dbDevice.id,
        deviceHash: dbDevice.device_hash,
        status: dbDevice.status,
        containerInfo: {
          containerId: dbDevice.container_id,
          port: dbDevice.container_port
        },
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

  if (!device) {
    throw new CustomError(
      `Dispositivo com device hash ${instanceId} não encontrado`,
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  // 3. Ensure device is active (combines ensureActive logic)
  if (device.status !== 'active' && device.status !== 'connected') {
    throw new CustomError(
      `Dispositivo ${instanceId} não está ativo. Status: ${device.status}`,
      400,
      'DEVICE_NOT_ACTIVE'
    );
  }

  // 4. Ensure container info exists
  if (!device.containerInfo?.port) {
    throw new CustomError(
      `Container não encontrado para dispositivo ${instanceId}`,
      500,
      'CONTAINER_NOT_FOUND'
    );
  }

  // 5. Proxy to container (combines proxyToContainer logic)
  const containerPort = device.containerInfo.port;
  const targetUrl = `http://localhost:${containerPort}${req.originalUrl.replace('/api', '')}`;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(`${DEFAULT_ADMIN_USER}:${DEFAULT_ADMIN_PASS}`).toString('base64')}`
  };

  try {
    logger.debug(`Proxying ${req.method} ${req.originalUrl} to ${targetUrl} for device ${instanceId}`);
    
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      params: req.query,
      headers: headers,
      timeout: 30000
    });

    // Forward response
    res.status(response.status).json(response.data);

  } catch (error) {
    if (error.response) {
      // Container responded with error
      logger.warn(`Container error for device ${instanceId}: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      res.status(error.response.status).json(error.response.data);
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      // Container is not reachable
      throw new CustomError(
        `Dispositivo ${instanceId} não está acessível. Container pode estar desligado.`,
        503,
        'CONTAINER_UNREACHABLE'
      );
    } else {
      // Other network/proxy errors
      logger.error(`Proxy error for device ${instanceId}:`, error.message);
      throw new CustomError(
        'Erro interno no proxy da requisição',
        500,
        'PROXY_ERROR'
      );
    }
  }
});

module.exports = proxyToActiveDevice;