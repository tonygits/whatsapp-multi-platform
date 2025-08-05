const express = require('express');
const axios = require('axios');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const deviceManager = require('../services/deviceManager');
const queueManager = require('../services/queueManager');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/messages/send
 * Send a message via WhatsApp
 */
router.post('/send', asyncHandler(async (req, res) => {
  const { from, to, message, type = 'text', priority = 5 } = req.body;

  if (!from || !to || !message) {
    throw new CustomError(
      'Campos obrigatórios: from, to, message',
      400,
      'MISSING_REQUIRED_FIELDS'
    );
  }

  // Validate phone numbers
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(from) || !phoneRegex.test(to)) {
    throw new CustomError(
      'Formato de número de telefone inválido',
      400,
      'INVALID_PHONE_FORMAT'
    );
  }

  // Get device information
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
      `Dispositivo ${from} não está ativo (status: ${device.status})`,
      400,
      'DEVICE_NOT_ACTIVE'
    );
  }

  // Create message function for queue
  const messageFunction = async () => {
    const containerUrl = `http://localhost:${device.port}`;
    
    const messageData = {
      phone: to,
      message,
      timestamp: new Date().toISOString()
    };

    try {
      const response = await axios.post(`${containerUrl}/send/message`, messageData, {
        timeout: 25000, // 25 seconds timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new CustomError(
          `Container ${from} não está respondendo`,
          503,
          'CONTAINER_UNAVAILABLE'
        );
      }
      
      if (error.response) {
        throw new CustomError(
          error.response.data?.message || 'Erro no container WhatsApp',
          error.response.status,
          'CONTAINER_ERROR',
          error.response.data
        );
      }

      throw error;
    }
  };

  logger.info(`Adicionando mensagem à fila: ${from} -> ${to}`);

  // Add to queue
  const result = await queueManager.addMessage(from, messageFunction, priority);

  res.json({
    success: true,
    message: 'Mensagem adicionada à fila com sucesso',
    data: {
      messageId: result.messageId || `msg_${Date.now()}`,
      from,
      to,
      queuedAt: new Date().toISOString(),
      priority,
      queueStatus: queueManager.getQueueStatus(from)
    }
  });
}));

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
        phoneNumber,
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

  logger.info(`Fila pausada para ${phoneNumber}`);

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

  logger.info(`Fila retomada para ${phoneNumber}`);

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

  logger.info(`Fila limpa para ${phoneNumber}`);

  res.json({
    success: true,
    message: 'Fila limpa com sucesso'
  });
}));

/**
 * POST /api/messages/send-media
 * Send media message (image, video, document, etc.)
 */
router.post('/send-media', asyncHandler(async (req, res) => {
  const { from, to, media, caption, type = 'image', priority = 5 } = req.body;

  if (!from || !to || !media) {
    throw new CustomError(
      'Campos obrigatórios: from, to, media',
      400,
      'MISSING_REQUIRED_FIELDS'
    );
  }

  // Validate media type
  const allowedTypes = ['image', 'video', 'audio', 'document'];
  if (!allowedTypes.includes(type)) {
    throw new CustomError(
      `Tipo de mídia inválido. Permitidos: ${allowedTypes.join(', ')}`,
      400,
      'INVALID_MEDIA_TYPE'
    );
  }

  // Get device
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

  // Create media message function
  const messageFunction = async () => {
    const containerUrl = `http://localhost:${device.port}`;
    
    const messageData = {
      phone: to,
      media,
      caption,
      type,
      timestamp: new Date().toISOString()
    };

    const response = await axios.post(`${containerUrl}/send/image`, messageData, {
      timeout: 60000, // 60 seconds for media
      headers: { 'Content-Type': 'application/json' }
    });

    return response.data;
  };

  logger.info(`Adicionando mensagem de mídia à fila: ${from} -> ${to} (${type})`);

  const result = await queueManager.addMessage(from, messageFunction, priority);

  res.json({
    success: true,
    message: 'Mensagem de mídia adicionada à fila',
    data: {
      messageId: result.messageId || `media_${Date.now()}`,
      from,
      to,
      type,
      queuedAt: new Date().toISOString(),
      priority
    }
  });
}));

/**
 * GET /api/messages/history/:phoneNumber
 * Get message history for a device (if supported by container)
 */
router.get('/history/:phoneNumber', asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  const device = await deviceManager.getDevice(phoneNumber);
  if (!device) {
    throw new CustomError(
      `Dispositivo ${phoneNumber} não encontrado`,
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  try {
    const containerUrl = `http://localhost:${device.port}`;
    const response = await axios.get(`${containerUrl}/message-history`, {
      params: { limit, offset },
      timeout: 10000
    });

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new CustomError(
        'Container não está respondendo',
        503,
        'CONTAINER_UNAVAILABLE'
      );
    }

    if (error.response?.status === 404) {
      throw new CustomError(
        'Funcionalidade de histórico não disponível',
        404,
        'HISTORY_NOT_SUPPORTED'
      );
    }

    throw error;
  }
}));

module.exports = router;