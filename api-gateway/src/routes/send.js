const express = require('express');
const axios = require('axios');
const { asyncHandler } = require('../middleware/errorHandler');
const queueManager = require('../services/queueManager');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');
const resolveInstance = require('../middleware/resolveInstance');
const proxyToContainer = require('../middleware/proxyToContainer');

const router = express.Router();

/**
 * Proxy request to WhatsApp container with queue support
 */
const proxyWithQueue = asyncHandler(async (req, res) => {
  const { priority = 5 } = req.body;
  const phoneNumber = req.device.phoneNumber;

  // Create message function for queue
  const messageFunction = async () => {
    const containerPort = req.device.containerInfo.port;
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
router.post('/presence', resolveInstance, proxyToContainer);

/**
 * POST /api/send/chat-presence
 * Send chat presence (typing indicator)
 */
router.post('/chat-presence', resolveInstance, proxyToContainer);

module.exports = router;