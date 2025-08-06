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