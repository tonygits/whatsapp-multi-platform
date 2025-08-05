const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const deviceManager = require('../services/deviceManager');
const containerManager = require('../services/containerManager');
const queueManager = require('../services/queueManager');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/health
 * Basic health check
 */
router.get('/', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTime: Date.now() - startTime,
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
}));

/**
 * GET /api/health/detailed
 * Detailed health check with all services
 */
router.get('/detailed', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const checks = {};

  // Check Device Manager
  try {
    const stats = await deviceManager.getStats();
    checks.deviceManager = {
      status: 'healthy',
      stats,
      message: 'Device Manager operacional'
    };
  } catch (error) {
    checks.deviceManager = {
      status: 'unhealthy',
      error: error.message,
      message: 'Erro no Device Manager'
    };
  }

  // Check Container Manager
  try {
    const containers = await containerManager.listContainers();
    checks.containerManager = {
      status: 'healthy',
      containerCount: containers.length,
      runningContainers: containers.filter(c => c.running).length,
      message: 'Container Manager operacional'
    };
  } catch (error) {
    checks.containerManager = {
      status: 'unhealthy',
      error: error.message,
      message: 'Erro no Container Manager'
    };
  }

  // Check Queue Manager
  try {
    const queueStats = queueManager.getOverallStats();
    checks.queueManager = {
      status: 'healthy',
      stats: queueStats,
      message: 'Queue Manager operacional'
    };
  } catch (error) {
    checks.queueManager = {
      status: 'unhealthy',
      error: error.message,
      message: 'Erro no Queue Manager'
    };
  }

  // Check Docker connectivity
  try {
    const Docker = require('dockerode');
    const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });
    await docker.ping();
    
    checks.docker = {
      status: 'healthy',
      message: 'Docker conectado'
    };
  } catch (error) {
    checks.docker = {
      status: 'unhealthy',
      error: error.message,
      message: 'Erro na conexão com Docker'
    };
  }

  // Check file system permissions
  try {
    const fs = require('fs').promises;
    const testPath = process.env.CONFIG_FILE_PATH || './config/devices.json';
    await fs.access(testPath);
    
    checks.fileSystem = {
      status: 'healthy',
      message: 'Sistema de arquivos acessível'
    };
  } catch (error) {
    checks.fileSystem = {
      status: 'unhealthy',
      error: error.message,
      message: 'Erro no sistema de arquivos'
    };
  }

  // Overall health status
  const allHealthy = Object.values(checks).every(check => check.status === 'healthy');
  const overallStatus = allHealthy ? 'healthy' : 'degraded';

  res.status(allHealthy ? 200 : 503).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    checks,
    summary: {
      total: Object.keys(checks).length,
      healthy: Object.values(checks).filter(c => c.status === 'healthy').length,
      unhealthy: Object.values(checks).filter(c => c.status === 'unhealthy').length
    }
  });
}));

/**
 * GET /api/health/devices
 * Health check for all devices
 */
router.get('/devices', asyncHandler(async (req, res) => {
  const devices = await deviceManager.getAllDevices();
  const deviceChecks = {};

  for (const [phoneNumber, device] of Object.entries(devices)) {
    try {
      // Check container status
      const containerStatus = await containerManager.getContainerStatus(phoneNumber);
      
      // Check queue status
      const queueStatus = queueManager.getQueueStatus(phoneNumber);

      // Try to ping the container
      let containerReachable = false;
      if (containerStatus && containerStatus.running) {
        try {
          const axios = require('axios');
          const response = await axios.get(`http://localhost:${device.port}/health`, {
            timeout: 5000
          });
          containerReachable = response.status === 200;
        } catch (error) {
          containerReachable = false;
        }
      }

      deviceChecks[phoneNumber] = {
        status: device.status === 'active' && containerReachable ? 'healthy' : 'unhealthy',
        device: {
          status: device.status,
          lastActivity: device.lastActivity,
          authStatus: device.authStatus
        },
        container: containerStatus || { status: 'not_found' },
        queue: queueStatus || { status: 'no_queue' },
        containerReachable,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      deviceChecks[phoneNumber] = {
        status: 'error',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  const healthyDevices = Object.values(deviceChecks).filter(d => d.status === 'healthy').length;
  const totalDevices = Object.keys(deviceChecks).length;

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    devices: deviceChecks,
    summary: {
      total: totalDevices,
      healthy: healthyDevices,
      unhealthy: totalDevices - healthyDevices,
      healthPercentage: totalDevices > 0 ? ((healthyDevices / totalDevices) * 100).toFixed(2) : 0
    }
  });
}));

/**
 * GET /api/health/containers
 * Health check for all containers
 */
router.get('/containers', asyncHandler(async (req, res) => {
  const containers = await containerManager.listContainers();
  
  const containerChecks = await Promise.all(
    containers.map(async (container) => {
      try {
        // Try to reach container health endpoint
        const axios = require('axios');
        const response = await axios.get(`http://localhost:${container.port}/health`, {
          timeout: 3000
        });
        
        return {
          phoneNumber: container.phoneNumber,
          containerId: container.id,
          status: 'healthy',
          containerStatus: container.status,
          running: container.running,
          port: container.port,
          healthEndpoint: response.data,
          lastChecked: new Date().toISOString()
        };
      } catch (error) {
        return {
          phoneNumber: container.phoneNumber,
          containerId: container.id,
          status: 'unhealthy',
          containerStatus: container.status,
          running: container.running,
          port: container.port,
          error: error.message,
          lastChecked: new Date().toISOString()
        };
      }
    })
  );

  const healthyContainers = containerChecks.filter(c => c.status === 'healthy').length;

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    containers: containerChecks,
    summary: {
      total: containerChecks.length,
      healthy: healthyContainers,
      unhealthy: containerChecks.length - healthyContainers,
      running: containerChecks.filter(c => c.running).length,
      stopped: containerChecks.filter(c => !c.running).length
    }
  });
}));

/**
 * GET /api/health/system
 * System health metrics
 */
router.get('/system', asyncHandler(async (req, res) => {
  const os = require('os');
  
  const memoryUsage = process.memoryUsage();
  const systemMemory = {
    total: os.totalmem(),
    free: os.freemem(),
    used: os.totalmem() - os.freemem()
  };

  const cpuUsage = process.cpuUsage();
  const loadAverage = os.loadavg();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    system: {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      loadAverage,
      cpuCount: os.cpus().length
    },
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      version: process.version,
      nodeVersion: process.versions.node,
      memoryUsage: {
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`
      }
    },
    memory: {
      total: `${(systemMemory.total / 1024 / 1024 / 1024).toFixed(2)} GB`,
      free: `${(systemMemory.free / 1024 / 1024 / 1024).toFixed(2)} GB`,
      used: `${(systemMemory.used / 1024 / 1024 / 1024).toFixed(2)} GB`,
      usage: `${((systemMemory.used / systemMemory.total) * 100).toFixed(2)}%`
    }
  });
}));

/**
 * POST /api/health/auto-heal
 * Attempt to auto-heal unhealthy services
 */
router.post('/auto-heal', asyncHandler(async (req, res) => {
  const { services = [] } = req.body;
  const healingResults = {};

  logger.info('Iniciando processo de auto-healing...');

  // Heal specific services or all if none specified
  const servicesToHeal = services.length > 0 ? services : ['containers', 'queues'];

  for (const service of servicesToHeal) {
    try {
      switch (service) {
        case 'containers':
          const devices = await deviceManager.getDevicesByStatus('active');
          let healedContainers = 0;
          
          for (const device of devices) {
            const containerStatus = await containerManager.getContainerStatus(device.phoneNumber);
            
            if (!containerStatus || !containerStatus.running) {
              try {
                await containerManager.startContainer(device.phoneNumber);
                healedContainers++;
                logger.info(`Container ${device.phoneNumber} reiniciado`);
              } catch (error) {
                logger.error(`Erro ao reiniciar container ${device.phoneNumber}:`, error);
              }
            }
          }
          
          healingResults.containers = {
            status: 'success',
            healedCount: healedContainers,
            message: `${healedContainers} containers reiniciados`
          };
          break;

        case 'queues':
          // Clean up inactive queues
          queueManager.cleanupInactiveQueues();
          
          healingResults.queues = {
            status: 'success',
            message: 'Limpeza de filas inativas realizada'
          };
          break;

        default:
          healingResults[service] = {
            status: 'error',
            message: `Serviço ${service} não suportado para auto-healing`
          };
      }
    } catch (error) {
      healingResults[service] = {
        status: 'error',
        error: error.message,
        message: `Erro durante healing do serviço ${service}`
      };
    }
  }

  logger.info('Processo de auto-healing concluído');

  res.json({
    status: 'completed',
    timestamp: new Date().toISOString(),
    results: healingResults
  });
}));

module.exports = router;