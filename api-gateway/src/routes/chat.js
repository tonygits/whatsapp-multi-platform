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
 * GET /api/chat/list
 * Get chat list
 */
router.get('/list', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/find
 * Find chat
 */
router.post('/find', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/whatsapp/find
 * Find WhatsApp chat
 */
router.post('/whatsapp/find', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/presence
 * Update chat presence
 */
router.post('/presence', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/search
 * Search in chat
 */
router.post('/search', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/mute
 * Mute chat
 */
router.post('/mute', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/unmute
 * Unmute chat
 */
router.post('/unmute', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/archive
 * Archive chat
 */
router.post('/archive', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/unarchive
 * Unarchive chat
 */
router.post('/unarchive', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/pin
 * Pin chat
 */
router.post('/pin', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/unpin
 * Unpin chat
 */
router.post('/unpin', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/mark-as-read
 * Mark chat as read
 */
router.post('/mark-as-read', resolveInstance, proxyToContainer);

/**
 * POST /api/chat/mark-as-unread
 * Mark chat as unread
 */
router.post('/mark-as-unread', resolveInstance, proxyToContainer);

/**
 * DELETE /api/chat/clear
 * Clear chat
 */
router.delete('/clear', resolveInstance, proxyToContainer);

/**
 * DELETE /api/chat/delete
 * Delete chat
 */
router.delete('/delete', resolveInstance, proxyToContainer);

module.exports = router;