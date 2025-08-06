const express = require('express');
const axios = require('axios');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const deviceManager = require('../services/newDeviceManager');
const queueManager = require('../services/queueManager');
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
 * Proxy request to WhatsApp container with queue support
 */
const proxyWithQueue = asyncHandler(async (req, res) => {
  const { priority = 5 } = req.body;
  const phoneNumber = req.instance.phoneNumber;

  // Create message function for queue
  const messageFunction = async () => {
    const containerPort = req.instance.container_port;
    const targetUrl = `http://localhost:${containerPort}${req.originalUrl.replace('/api', '')}`;

    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      params: req.query,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 25000
    });

    return response.data;
  };

  logger.info(`Adding message to queue: ${PhoneUtils.maskForLog(phoneNumber, 'info')} -> ${req.originalUrl}`);

  // Add to queue
  const result = await queueManager.addMessage(phoneNumber, messageFunction, priority);

  res.json({
    success: true,
    message: 'Message added to queue successfully',
    data: {
      messageId: `queued_${Date.now()}`,
      queuedAt: new Date().toISOString(),
      priority,
      queueStatus: queueManager.getQueueStatus(phoneNumber),
      result
    }
  });
});

/**
 * Direct proxy without queue
 */
const proxyDirect = asyncHandler(async (req, res) => {
  const containerPort = req.instance.container_port;
  const targetUrl = `http://localhost:${containerPort}${req.originalUrl.replace('/api', '')}`;

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      params: req.query,
      headers: {
        'Content-Type': 'application/json'
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
 * POST /api/send/message
 * Send message
 */
router.post('/message', resolveInstance, proxyWithQueue);

/**
 * POST /api/send/image
 * Send image
 */
router.post('/image', resolveInstance, proxyWithQueue);

/**
 * POST /api/send/audio
 * Send audio
 */
router.post('/audio', resolveInstance, proxyWithQueue);

/**
 * POST /api/send/video
 * Send video
 */
router.post('/video', resolveInstance, proxyWithQueue);

/**
 * POST /api/send/file
 * Send file
 */
router.post('/file', resolveInstance, proxyWithQueue);

/**
 * POST /api/send/contact
 * Send contact
 */
router.post('/contact', resolveInstance, proxyWithQueue);

/**
 * POST /api/send/link
 * Send link
 */
router.post('/link', resolveInstance, proxyWithQueue);

/**
 * POST /api/send/location
 * Send location
 */
router.post('/location', resolveInstance, proxyWithQueue);

/**
 * POST /api/send/poll
 * Send poll/vote
 */
router.post('/poll', resolveInstance, proxyWithQueue);

/**
 * POST /api/send/presence
 * Send presence status
 */
router.post('/presence', resolveInstance, proxyDirect);

/**
 * POST /api/send/chat-presence
 * Send chat presence (typing indicator)
 */
router.post('/chat-presence', resolveInstance, proxyDirect);

module.exports = router;