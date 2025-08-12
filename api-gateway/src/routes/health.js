const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const deviceManager = require('../services/newDeviceManager');
const binaryManager = require('../services/binaryManager');
const logger = require('../utils/logger');
const fsPromises = require('fs').promises;
const database = require('../database/database');
const { BIN_PATH } = require('../utils/paths');
const axios = require('axios');
const os = require('os');

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

  // Check Binary Manager
  try {
    const processes = await binaryManager.listProcesses();
    checks.binaryManager = {
      status: 'healthy',
      processCount: processes.length,
      runningProcesses: processes.filter(p => p.running).length,
      message: 'Binary Manager operacional'
    };
  } catch (error) {
    checks.binaryManager = {
      status: 'unhealthy',
      error: error.message,
      message: 'Erro no Binary Manager'
    };
  }


  // Check WhatsApp binary
  try {
    await fsPromises.access(BIN_PATH, fsPromises.constants.F_OK | fsPromises.constants.X_OK);
    
    checks.whatsappBinary = {
      status: 'healthy',
      message: 'Binário WhatsApp acessível'
    };
  } catch (error) {
    checks.whatsappBinary = {
      status: 'unhealthy',
      error: error.message,
      message: 'Erro no binário WhatsApp'
    };
  }

  // Check database file access
  try {
    await fsPromises.access(database.dbPath);
    
    checks.fileSystem = {
      status: 'healthy',
      message: 'Banco de dados acessível'
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

  for (const [deviceHash, device] of Object.entries(devices)) {
    try {
      // Check process status
      const processStatus = await binaryManager.getProcessStatus(deviceHash);

      // Try to ping the process
      let processReachable = false;
      if (processStatus && processStatus.running) {
        try {
          const response = await axios.get(`http://localhost:${device.port}/health`, { timeout: 5000 });
          processReachable = response.status === 200;
        } catch (error) {
          processReachable = false;
        }
      }

      deviceChecks[deviceHash] = {
        status: device.status === 'active' && processReachable ? 'healthy' : 'unhealthy',
        device: {
          status: device.status,
          lastActivity: device.lastActivity,
          authStatus: device.authStatus
        },
        process: processStatus || { status: 'not_found' },
        processReachable,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      deviceChecks[deviceHash] = {
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
 * GET /api/health/processes
 * Health check for all WhatsApp processes
 */
router.get('/processes', asyncHandler(async (req, res) => {
  const processes = await binaryManager.listProcesses();
  
  const processChecks = await Promise.all(
    processes.map(async (process) => {
      try {
        // Try to reach process health endpoint
        const response = await axios.get(`http://localhost:${process.port}/health`, { timeout: 3000 });
        
        return {
          deviceHash: process.deviceHash,
          pid: process.pid,
          status: 'healthy',
          processStatus: process.status,
          running: process.running,
          port: process.port,
          healthEndpoint: response.data,
          lastChecked: new Date().toISOString()
        };
      } catch (error) {
        return {
          deviceHash: process.deviceHash,
          pid: process.pid,
          status: 'unhealthy',
          processStatus: process.status,
          running: process.running,
          port: process.port,
          error: error.message,
          lastChecked: new Date().toISOString()
        };
      }
    })
  );

  const healthyProcesses = processChecks.filter(p => p.status === 'healthy').length;

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    processes: processChecks,
    summary: {
      total: processChecks.length,
      healthy: healthyProcesses,
      unhealthy: processChecks.length - healthyProcesses,
      running: processChecks.filter(p => p.running).length,
      stopped: processChecks.filter(p => !p.running).length
    }
  });
}));

/**
 * GET /api/health/system
 * System health metrics
 */
router.get('/system', asyncHandler(async (req, res) => {
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
  const servicesToHeal = services.length > 0 ? services : ['processes'];

  for (const service of servicesToHeal) {
    try {
      switch (service) {
        case 'processes':
          const devices = await deviceManager.getDevicesByStatus('active');
          let healedProcesses = 0;
          
          for (const device of devices) {
            const processStatus = await binaryManager.getProcessStatus(device.deviceHash);
            
            if (!processStatus || !processStatus.running) {
              try {
                await binaryManager.startProcess(device.deviceHash);
                healedProcesses++;
                logger.info(`Processo ${device.deviceHash} reiniciado`);
              } catch (error) {
                logger.error(`Erro ao reiniciar processo ${device.deviceHash}:`, error);
              }
            }
          }
          
          healingResults.processes = {
            status: 'success',
            healedCount: healedProcesses,
            message: `${healedProcesses} processos reiniciados`
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