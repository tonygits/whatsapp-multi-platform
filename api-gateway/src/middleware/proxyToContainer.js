const axios = require('axios');
const { asyncHandler, CustomError } = require('./errorHandler');
const logger = require('../utils/logger');

/**
 * Proxy request to WhatsApp container
 * Assumes req.device is populated by resolveInstance middleware
 */
const proxyToContainer = asyncHandler(async (req, res) => {
  const containerPort = req.device.containerInfo.port;
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

module.exports = proxyToContainer;