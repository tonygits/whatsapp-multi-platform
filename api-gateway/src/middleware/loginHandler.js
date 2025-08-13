const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { asyncHandler, CustomError } = require('./errorHandler');
const logger = require('../utils/logger');
const { SESSIONS_DIR } = require('../utils/paths');

const DEFAULT_ADMIN_USER = process.env.DEFAULT_ADMIN_USER || 'admin';
const DEFAULT_ADMIN_PASS = process.env.DEFAULT_ADMIN_PASS || 'admin';

/**
 * Handle login request and intercept QR code generation
 */
const loginHandler = asyncHandler(async (req, res) => {
  const containerPort = req.device.containerInfo.port;
  const deviceHash = req.device.deviceHash;
  const targetUrl = `http://localhost:${containerPort}${req.originalUrl.replace('/api', '')}`;

  // Add basic auth header
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(`${DEFAULT_ADMIN_USER}:${DEFAULT_ADMIN_PASS}`).toString('base64')}`,
  };

  try {
    logger.info(`Fazendo login para dispositivo ${deviceHash} na porta ${containerPort}`);
    
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      params: req.query,
      headers: headers,
      timeout: 30000
    });

    const responseData = response.data;
    
    // Check if response contains QR code information in results
    if (responseData && responseData.results && responseData.results.qr_link && responseData.results.qr_link.includes('/statics/')) {
      logger.info(`QR code detectado no response para ${deviceHash}`);
      
      try {
        // Extract QR file path from the link
        const qrFileName = responseData.results.qr_link.split('/').pop();
        const sessionPath = path.join(SESSIONS_DIR, deviceHash);
        const qrFilePath = path.join(sessionPath, 'statics', 'qrcode', qrFileName);
        
        logger.info(`Tentando ler arquivo QR: ${qrFilePath}`);
        
        // Wait a bit for the file to be written
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if file exists and read it
        const qrExists = await fs.access(qrFilePath).then(() => true).catch(() => false);
        
        if (qrExists) {
          // Read the QR code file and convert to base64
          const qrBuffer = await fs.readFile(qrFilePath);
          const qrBase64 = qrBuffer.toString('base64');
          
          // Replace qr_link with base64 data URL
          responseData.results.qr_code = `data:image/png;base64,${qrBase64}`;
          
          // Remove the old qr_link field
          delete responseData.results.qr_link;
          
          logger.info(`QR code convertido para base64 para ${deviceHash}`);
        } else {
          logger.warn(`Arquivo QR não encontrado: ${qrFilePath}`);
          // Keep original response if file doesn't exist
        }
        
      } catch (qrError) {
        logger.error(`Erro ao processar QR code para ${deviceHash}:`, qrError);
        // Continue with original response if QR processing fails
      }
    }

    res.status(response.status).json(responseData);
    
  } catch (error) {
    logger.error(`Error proxying login to container ${containerPort}:`, error.message);
    
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

module.exports = loginHandler;