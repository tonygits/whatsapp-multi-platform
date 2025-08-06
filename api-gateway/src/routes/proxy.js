const express = require('express');
const axios = require('axios');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const deviceManager = require('../services/newDeviceManager');
const queueManager = require('../services/queueManager');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');

const router = express.Router();

/**
 * Proxy inteligente para rotas do WhatsApp
 * Roteia requisições para o container correto baseado no número de telefone
 */

/**
 * Middleware para extrair número de telefone da requisição
 */
const extractPhoneNumber = (req, res, next) => {
  let phoneNumber = null;

  // Tentar extrair do path parameter
  if (req.params.phoneNumber) {
    phoneNumber = req.params.phoneNumber;
  }
  // Tentar extrair do body
  else if (req.body.phone) {
    phoneNumber = req.body.phone.replace('@s.whatsapp.net', '');
  }
  // Tentar extrair de query parameter
  else if (req.query.phone) {
    phoneNumber = req.query.phone.replace('@s.whatsapp.net', '');
  }

  if (!phoneNumber) {
    return res.status(400).json({
      error: 'Número de telefone não identificado na requisição',
      code: 'PHONE_NUMBER_REQUIRED'
    });
  }

  req.phoneNumber = phoneNumber;
  next();
};

/**
 * Middleware para verificar se o container está ativo
 */
const checkContainerActive = asyncHandler(async (req, res, next) => {
  const device = await deviceManager.getDevice(req.phoneNumber);
  
  if (!device) {
    throw new CustomError(
      `Dispositivo ${req.phoneNumber} não está registrado`,
      404,
      'DEVICE_NOT_FOUND'
    );
  }

  if (device.status !== 'active') {
    throw new CustomError(
      `Dispositivo ${req.phoneNumber} não está ativo (status: ${device.status})`,
      503,
      'DEVICE_NOT_ACTIVE'
    );
  }

  req.device = device;
  next();
});

/**
 * Função genérica de proxy para WhatsApp API
 */
const proxyToWhatsApp = asyncHandler(async (req, res) => {
  const { device } = req;
  const containerUrl = `http://localhost:${device.port}`;
  
  // Preparar URL de destino
  const targetPath = req.originalUrl.replace('/proxy/whatsapp', '');
  const targetUrl = `${containerUrl}${targetPath}`;

  try {
    logger.debug(`Proxy: ${req.method} ${req.originalUrl} -> ${targetUrl}`);

    const proxyConfig = {
      method: req.method,
      url: targetUrl,
      headers: {
        ...req.headers,
        host: `localhost:${device.port}`
      },
      timeout: 30000,
      validateStatus: () => true // Não lançar erro para códigos de status HTTP
    };

    // Adicionar body se presente
    if (req.body && Object.keys(req.body).length > 0) {
      proxyConfig.data = req.body;
    }

    // Adicionar query parameters
    if (req.query && Object.keys(req.query).length > 0) {
      proxyConfig.params = req.query;
    }

    const response = await axios(proxyConfig);

    // Log da resposta
    logger.debug(`Proxy response: ${response.status} from ${targetUrl}`);

    // Repassar headers relevantes
    const headersToForward = [
      'content-type',
      'content-length',
      'cache-control',
      'expires',
      'last-modified',
      'etag'
    ];

    headersToForward.forEach(header => {
      if (response.headers[header]) {
        res.set(header, response.headers[header]);
      }
    });

    // Enviar resposta
    res.status(response.status).send(response.data);

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new CustomError(
        `Container ${req.phoneNumber} não está respondendo`,
        503,
        'CONTAINER_UNAVAILABLE'
      );
    }

    logger.error(`Erro no proxy para ${targetUrl}:`, error);
    throw new CustomError(
      'Erro na comunicação com o container WhatsApp',
      502,
      'PROXY_ERROR'
    );
  }
});

/**
 * Proxy para envio de mensagens com fila
 */
const proxyMessageWithQueue = asyncHandler(async (req, res) => {
  const { device } = req;
  const { priority = 5 } = req.body;

  // Extrair destino da mensagem
  const to = req.body.phone || req.body.to;
  if (!to) {
    throw new CustomError(
      'Destinatário da mensagem é obrigatório',
      400,
      'RECIPIENT_REQUIRED'
    );
  }

  // Criar função de envio para a fila
  const messageFunction = async () => {
    const containerUrl = `http://localhost:${device.port}`;
    const targetPath = req.originalUrl.replace('/proxy/whatsapp', '');
    const targetUrl = `${containerUrl}${targetPath}`;

    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 25000
    });

    return response.data;
  };

  logger.info(`Adicionando mensagem à fila: ${PhoneUtils.maskForLog(req.phoneNumber, 'info')} -> ${PhoneUtils.maskForLog(to, 'info')}`);

  // Adicionar à fila
  const result = await queueManager.addMessage(req.phoneNumber, messageFunction, priority);

  res.json({
    success: true,
    message: 'Mensagem adicionada à fila com sucesso',
    data: {
      messageId: `queued_${Date.now()}`,
      from: PhoneUtils.maskForLog(req.phoneNumber, 'info'),
      to: PhoneUtils.maskForLog(to, 'info'),
      queuedAt: new Date().toISOString(),
      priority,
      queueStatus: queueManager.getQueueStatus(req.phoneNumber)
    }
  });
});

// ====== ROTAS DE PROXY ======

/**
 * Proxy para todas as rotas /app/*
 * (login, logout, reconnect, devices)
 */
router.all('/app/*', extractPhoneNumber, checkContainerActive, proxyToWhatsApp);

/**
 * Proxy para rotas de envio com fila
 */
router.post('/send/message', extractPhoneNumber, checkContainerActive, proxyMessageWithQueue);
router.post('/send/image', extractPhoneNumber, checkContainerActive, proxyMessageWithQueue);
router.post('/send/audio', extractPhoneNumber, checkContainerActive, proxyMessageWithQueue);
router.post('/send/video', extractPhoneNumber, checkContainerActive, proxyMessageWithQueue);
router.post('/send/file', extractPhoneNumber, checkContainerActive, proxyMessageWithQueue);
router.post('/send/contact', extractPhoneNumber, checkContainerActive, proxyMessageWithQueue);
router.post('/send/link', extractPhoneNumber, checkContainerActive, proxyMessageWithQueue);
router.post('/send/location', extractPhoneNumber, checkContainerActive, proxyMessageWithQueue);
router.post('/send/poll', extractPhoneNumber, checkContainerActive, proxyMessageWithQueue);

/**
 * Proxy para outras rotas /send/*
 */
router.all('/send/*', extractPhoneNumber, checkContainerActive, proxyToWhatsApp);

/**
 * Proxy para rotas de usuário
 */
router.all('/user/*', extractPhoneNumber, checkContainerActive, proxyToWhatsApp);

/**
 * Proxy para rotas de mensagem
 */
router.all('/message/*', extractPhoneNumber, checkContainerActive, proxyToWhatsApp);

/**
 * Proxy para rotas de chat
 */
router.all('/chat/*', extractPhoneNumber, checkContainerActive, proxyToWhatsApp);
router.all('/chats/*', extractPhoneNumber, checkContainerActive, proxyToWhatsApp);

/**
 * Proxy para rotas de grupo
 */
router.all('/group/*', extractPhoneNumber, checkContainerActive, proxyToWhatsApp);

/**
 * Proxy para rotas de newsletter
 */
router.all('/newsletter/*', extractPhoneNumber, checkContainerActive, proxyToWhatsApp);

/**
 * Rota especial para quando o número não é identificado
 * Permite acesso direto via parâmetro
 */
router.all('/:phoneNumber/*', (req, res, next) => {
  // Mover phoneNumber do path para req.phoneNumber
  req.phoneNumber = req.params.phoneNumber;
  
  // Reescrever URL removendo o phoneNumber do path
  const newPath = req.originalUrl.replace(`/proxy/whatsapp/${req.params.phoneNumber}`, '');
  req.originalUrl = `/proxy/whatsapp${newPath}`;
  
  next();
}, checkContainerActive, proxyToWhatsApp);

/**
 * Middleware de fallback - número de telefone obrigatório
 */
router.all('*', (req, res) => {
  res.status(400).json({
    error: 'Número de telefone não identificado. Use: /proxy/whatsapp/{phoneNumber}/rota ou inclua phone no body/query',
    code: 'PHONE_NUMBER_REQUIRED',
    examples: {
      path: '/proxy/whatsapp/+5511999999999/app/login',
      body: '{"phone": "+5511999999999", "message": "test"}',
      query: '/proxy/whatsapp/send/message?phone=+5511999999999'
    }
  });
});

module.exports = router;