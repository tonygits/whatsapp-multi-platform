const express = require('express');
const axios = require('axios');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const deviceManager = require('../services/newDeviceManager');
const queueManager = require('../services/queueManager');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');

const router = express.Router();

/**
 * POST /api/messages/send-bulk
 * Send multiple messages
 */
router.post('/send-bulk', asyncHandler(async (req, res) => {
  const { from, messages, priority = 5 } = req.body;

  if (!from || !messages || !Array.isArray(messages)) {
    throw new CustomError(
      'Campos obrigatórios: from, messages (array)',
      400,
      'MISSING_REQUIRED_FIELDS'
    );
  }

  if (messages.length === 0) {
    throw new CustomError(
      'Lista de mensagens não pode estar vazia',
      400,
      'EMPTY_MESSAGES_LIST'
    );
  }

  if (messages.length > 100) {
    throw new CustomError(
      'Máximo de 100 mensagens por lote',
      400,
      'TOO_MANY_MESSAGES'
    );
  }

  // Validate device
  const device = await deviceManager.getDevice(from);
  if (!device) {
    throw new CustomError(
      `Dispositivo ${from} não está registrado`,
      404,
      'DEVICE_NOT_REGISTERED'
    );
  }

  if (device.status !== 'active') {
    throw new CustomError(
      `Dispositivo ${from} não está ativo`,
      400,
      'DEVICE_NOT_ACTIVE'
    );
  }

  // Create message functions
  const messageFunctions = messages.map(msg => {
    return async () => {
      const containerUrl = `http://localhost:${device.port}`;
      
      const messageData = {
        phone: msg.to,
        message: msg.message,
        timestamp: new Date().toISOString()
      };

      const response = await axios.post(`${containerUrl}/send/message`, messageData, {
        timeout: 25000,
        headers: { 'Content-Type': 'application/json' }
      });

      return response.data;
    };
  });

  logger.info(`Adicionando ${messages.length} mensagens em lote à fila: ${from}`);

  // Add bulk messages to queue
  const results = await queueManager.addBulkMessages(from, messageFunctions, priority);

  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const failureCount = results.filter(r => r.status === 'rejected').length;

  res.json({
    success: true,
    message: 'Mensagens adicionadas à fila',
    data: {
      totalMessages: messages.length,
      successCount,
      failureCount,
      queuedAt: new Date().toISOString(),
      queueStatus: queueManager.getQueueStatus(from),
      results: results.map((result, index) => ({
        index,
        status: result.status,
        error: result.status === 'rejected' ? result.reason.message : null
      }))
    }
  });
}));

/**
 * GET /api/messages/queue/:phoneNumber
 * Get queue status for a specific device
 */
router.get('/queue/:phoneNumber', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;

  const status = queueManager.getQueueStatus(phoneNumber);

  if (!status) {
    return res.json({
      success: true,
      data: {
        phoneNumber: PhoneUtils.maskForLog(phoneNumber, 'info'),
        queueExists: false,
        message: 'Nenhuma fila ativa para este dispositivo'
      }
    });
  }

  res.json({
    success: true,
    data: status
  });
}));

/**
 * GET /api/messages/queues
 * Get status of all message queues
 */
router.get('/queues', asyncHandler(async (req, res) => {
  const allQueues = queueManager.getAllQueuesStatus();
  const overallStats = queueManager.getOverallStats();

  res.json({
    success: true,
    data: {
      queues: allQueues,
      stats: overallStats
    }
  });
}));

/**
 * POST /api/messages/queue/:phoneNumber/pause
 * Pause message queue for a device
 */
router.post('/queue/:phoneNumber/pause', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;

  const success = queueManager.pauseQueue(phoneNumber);

  if (!success) {
    throw new CustomError(
      'Fila não encontrada',
      404,
      'QUEUE_NOT_FOUND'
    );
  }

  logger.info(`Fila pausada para ${PhoneUtils.maskForLog(phoneNumber, 'info')}`);

  res.json({
    success: true,
    message: 'Fila pausada com sucesso'
  });
}));

/**
 * POST /api/messages/queue/:phoneNumber/resume
 * Resume message queue for a device
 */
router.post('/queue/:phoneNumber/resume', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;

  const success = queueManager.resumeQueue(phoneNumber);

  if (!success) {
    throw new CustomError(
      'Fila não encontrada',
      404,
      'QUEUE_NOT_FOUND'
    );
  }

  logger.info(`Fila retomada para ${PhoneUtils.maskForLog(phoneNumber, 'info')}`);

  res.json({
    success: true,
    message: 'Fila retomada com sucesso'
  });
}));

/**
 * DELETE /api/messages/queue/:phoneNumber
 * Clear message queue for a device
 */
router.delete('/queue/:phoneNumber', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;

  const success = queueManager.clearQueue(phoneNumber);

  if (!success) {
    throw new CustomError(
      'Fila não encontrada',
      404,
      'QUEUE_NOT_FOUND'
    );
  }

  logger.info(`Fila limpa para ${PhoneUtils.maskForLog(phoneNumber, 'info')}`);

  res.json({
    success: true,
    message: 'Fila limpa com sucesso'
  });
}));

module.exports = router;