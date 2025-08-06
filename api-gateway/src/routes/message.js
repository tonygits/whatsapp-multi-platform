const express = require('express');
const axios = require('axios');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');
const resolveInstance = require('../middleware/resolveInstance');

const router = express.Router();

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
 * GET /api/message/list
 * Get message list
 */
router.get('/list', resolveInstance, proxyToContainer);

/**
 * POST /api/message/send
 * Send message (individual route, different from /api/send/message)
 */
router.post('/send', resolveInstance, proxyToContainer);

/**
 * POST /api/message/reaction/send
 * Send message reaction
 */
router.post('/reaction/send', resolveInstance, proxyToContainer);

/**
 * POST /api/message/revoke
 * Revoke message
 */
router.post('/revoke', resolveInstance, proxyToContainer);

/**
 * POST /api/message/update
 * Update message
 */
router.post('/update', resolveInstance, proxyToContainer);

/**
 * GET /api/message/history
 * Get message history
 */
router.get('/history', resolveInstance, proxyToContainer);

module.exports = router;