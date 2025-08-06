const express = require('express');
const axios = require('axios');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const deviceManager = require('../services/newDeviceManager');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');

const router = express.Router();

/**
 * Middleware to extract instance_id and resolve container
 */
const resolveInstance = asyncHandler(async (req, res, next) => {
  const instanceId = req.body.instance_id || req.query.instance_id || req.headers['x-instance-id'];
  
  if (!instanceId) {
    throw new CustomError(
      'instance_id is required in body, query, or header',
      400,
      'INSTANCE_ID_REQUIRED'
    );
  }

  // Try to find device by phone number or device_hash
  let device = await deviceManager.getDevice(instanceId);
  
  if (!device) {
    // Try by device_hash
    const DeviceRepository = require('../repositories/DeviceRepository');
    device = await DeviceRepository.findByDeviceHash(instanceId);
    
    if (device) {
      // Convert database format to device manager format
      device = {
        phoneNumber: device.phone_number,
        container_port: device.container_port,
        status: device.status === 'connected' ? 'active' : device.status
      };
    }
  }

  if (!device) {
    throw new CustomError(
      `Instance ${PhoneUtils.maskForLog(instanceId, 'error')} not found`,
      404,
      'INSTANCE_NOT_FOUND'
    );
  }

  if (device.status !== 'active') {
    throw new CustomError(
      `Instance ${PhoneUtils.maskForLog(instanceId, 'error')} is not active`,
      400,
      'INSTANCE_NOT_ACTIVE'
    );
  }

  req.instance = device;
  req.instanceId = instanceId;
  next();
});

/**
 * Proxy request to WhatsApp container
 */
const proxyToContainer = asyncHandler(async (req, res) => {
  const containerPort = req.instance.container_port;
  const targetUrl = `http://localhost:${containerPort}${req.originalUrl.replace('/api', '')}`;

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      params: req.query,
      headers: {
        'Content-Type': 'application/json',
        ...req.headers
      },
      timeout: 30000
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error(`Error proxying to container ${containerPort}:`, error.message);
    
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      throw new CustomError(
        'Container not responding',
        503,
        'CONTAINER_ERROR'
      );
    }
  }
});

/**
 * GET /api/user/info
 * Get user information
 */
router.get('/info', resolveInstance, proxyToContainer);

/**
 * GET /api/user/avatar
 * Get profile picture
 */
router.get('/avatar', resolveInstance, proxyToContainer);

/**
 * GET /api/user/my/groups
 * Get joined groups
 */
router.get('/my/groups', resolveInstance, proxyToContainer);

/**
 * GET /api/user/my/privacy
 * Get privacy settings
 */
router.get('/my/privacy', resolveInstance, proxyToContainer);

/**
 * POST /api/user/avatar
 * Set profile picture
 */
router.post('/avatar', resolveInstance, proxyToContainer);

/**
 * PUT /api/user/privacy
 * Set privacy settings
 */
router.put('/privacy', resolveInstance, proxyToContainer);

module.exports = router;