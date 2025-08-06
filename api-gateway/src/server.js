const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const winston = require('winston');
const { Server } = require('socket.io');
const http = require('http');

// Load environment variables
dotenv.config();

// Import custom modules
const logger = require('./utils/logger');
const containerManager = require('./services/containerManager');
const deviceManager = require('./services/newDeviceManager');
const qrManager = require('./services/qrManager');
const updateManager = require('./services/updateManager');
const { authMiddleware, authManager } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const deviceRoutes = require('./routes/devices');
const messageRoutes = require('./routes/messages');
const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');
const docsRoutes = require('./routes/docs');
const proxyRoutes = require('./routes/proxy');

class APIGateway {
  constructor() {
    console.log('🏗️ Iniciando constructor...');
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    this.port = process.env.API_PORT || 3000;
    console.log('✅ Express, server e Socket.IO criados');
    
    console.log('⚙️ Configurando middleware...');
    this.setupMiddleware();
    console.log('✅ Middleware configurado');
    
    console.log('🛣️ Configurando rotas...');
    this.setupRoutes();
    console.log('✅ Rotas configuradas');
    
    console.log('🔌 Configurando Socket.IO...');
    this.setupSocketIO();
    console.log('✅ Socket.IO configurado');
    
    console.log('❌ Configurando error handling...');
    this.setupErrorHandling();
    console.log('✅ Error handling configurado');
    console.log('🎉 Constructor finalizado!');
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.API_RATE_LIMIT || 100,
      message: 'Muitas requisições deste IP, tente novamente em 15 minutos.'
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // Public routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/health', healthRoutes);
    this.app.use('/docs', docsRoutes);

    // Protected routes
    if (process.env.API_AUTH_ENABLED === 'true') {
      this.app.use('/api', authMiddleware);
      this.app.use('/proxy', authMiddleware);
    }

    this.app.use('/api/devices', deviceRoutes);
    this.app.use('/api/messages', messageRoutes);
    
    // WhatsApp Proxy routes (direto para containers)
    this.app.use('/proxy/whatsapp', proxyRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'WhatsApp Multi-Platform API Gateway',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
          auth: '/api/auth',
          devices: '/api/devices',
          messages: '/api/messages',
          health: '/api/health',
          docs: '/docs',
          whatsapp_proxy: '/proxy/whatsapp'
        },
        links: {
          documentation: '/docs',
          openapi_yaml: '/docs/openapi.yaml',
          openapi_json: '/docs/openapi.json',
          postman_collection: '/docs/postman'
        },
        proxy_examples: {
          login: '/proxy/whatsapp/5511999999999/app/login',
          send_message: '/proxy/whatsapp/send/message',
          user_info: '/proxy/whatsapp/5511999999999/user/info'
        }
      });
    });
  }

  setupSocketIO() {
    this.io.on('connection', (socket) => {
      logger.info(`Socket client connected: ${socket.id}`);

      socket.on('join-device', (phoneNumber) => {
        socket.join(`device-${phoneNumber}`);
        logger.info(`Socket ${socket.id} joined room device-${phoneNumber}`);
      });

      socket.on('disconnect', () => {
        logger.info(`Socket client disconnected: ${socket.id}`);
      });
    });

    // Make io available globally for other modules
    global.socketIO = this.io;
  }

  setupErrorHandling() {
    this.app.use(errorHandler);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint não encontrado',
        path: req.originalUrl,
        method: req.method
      });
    });
  }

  async start() {
    try {
      console.log('🚀 INICIANDO start() method...');
      // Initialize services
      console.log('🔐 Inicializando authManager...');
      await authManager.initialize();
      console.log('✅ authManager inicializado');
      
      console.log('📦 Inicializando containerManager...');
      await containerManager.initialize();
      console.log('✅ containerManager inicializado');
      
      console.log('📱 Inicializando deviceManager...');
      await deviceManager.initialize();
      console.log('✅ deviceManager inicializado');
      
      // Initialize QR Manager
      qrManager.startPeriodicCleanup();
      
      // Initialize Update Manager
      updateManager.initialize();

      // Start server
      this.server.listen(this.port, () => {
        logger.info(`🚀 API Gateway rodando na porta ${this.port}`);
        logger.info(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`🔐 Autenticação: ${process.env.API_AUTH_ENABLED === 'true' ? 'Ativada' : 'Desativada'}`);
        logger.info(`🔄 Verificações de atualização: ${process.env.UPDATE_CHECK_CRON || '0 2 * * *'}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      logger.error('Erro ao inicializar API Gateway:', error);
      console.error('ERRO CRÍTICO:', error.message);
      console.error('STACK:', error.stack);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Iniciando shutdown graceful...');
    
    try {
      // Stop update manager
      updateManager.stop();
      
      // Close server
      this.server.close(() => {
        logger.info('Servidor HTTP fechado');
      });

      // Cleanup containers
      await containerManager.cleanup();
      
      logger.info('Shutdown concluído');
      process.exit(0);
    } catch (error) {
      logger.error('Erro durante shutdown:', error);
      process.exit(1);
    }
  }
}

// Initialize and start the API Gateway
console.log('🏗️ Criando instância do APIGateway...');
const gateway = new APIGateway();
console.log('✅ Instância criada, iniciando start()...');
gateway.start();

module.exports = gateway;