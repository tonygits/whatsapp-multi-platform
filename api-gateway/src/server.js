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
const deviceManager = require('./services/deviceManager');
const qrManager = require('./services/qrManager');
const updateManager = require('./services/updateManager');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const deviceRoutes = require('./routes/devices');
const messageRoutes = require('./routes/messages');
const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');

class APIGateway {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    this.port = process.env.API_PORT || 3000;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
    this.setupErrorHandling();
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

    // Protected routes
    if (process.env.API_AUTH_ENABLED === 'true') {
      this.app.use('/api', authMiddleware);
    }

    this.app.use('/api/devices', deviceRoutes);
    this.app.use('/api/messages', messageRoutes);

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
          health: '/api/health'
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
      // Initialize services
      await containerManager.initialize();
      await deviceManager.initialize();
      
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
const gateway = new APIGateway();
gateway.start();

module.exports = gateway;