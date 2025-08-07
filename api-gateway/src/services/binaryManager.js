const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const deviceManager = require('./newDeviceManager');

class BinaryManager {
  constructor() {
    this.binaryPath = '/app/whatsapp';
    this.processes = new Map(); // phoneNumber -> process info
    this.basicAuthUsername = process.env.BASIC_AUTH_USERNAME || 'admin';
    this.basicAuthPassword = process.env.BASIC_AUTH_PASSWORD || 'admin';
  }

  /**
   * Initialize the binary manager
   */
  async initialize() {
    logger.info('Inicializando Binary Manager...');
    
    try {
      // Check if binary exists and is executable
      await this.checkBinaryExists();
      
      // Load existing processes from device manager
      await this.loadExistingProcesses();

      // Start health check monitoring
      this.startHealthCheckMonitoring();

      logger.info('Binary Manager inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar Binary Manager:', error);
      throw error;
    }
  }

  /**
   * Check if the WhatsApp binary exists and is executable
   */
  async checkBinaryExists() {
    try {
      await fs.access(this.binaryPath, fs.constants.F_OK | fs.constants.X_OK);
      logger.info(`Binary WhatsApp encontrado em: ${this.binaryPath}`);
    } catch (error) {
      throw new Error(`Binary WhatsApp não encontrado ou não executável em: ${this.binaryPath}`);
    }
  }

  /**
   * Load existing processes and sync with device manager
   */
  async loadExistingProcesses() {
    try {
      const devices = await deviceManager.getAllDevices();
      logger.info(`Verificando ${devices.length} dispositivos registrados`);

      for (const device of devices) {
        if (device.status === 'active' && device.processId) {
          // Check if process is still running
          const isRunning = await this.isProcessRunning(device.processId);
          if (isRunning) {
            this.processes.set(device.phoneNumber, {
              pid: device.processId,
              phoneNumber: device.phoneNumber,
              port: device.port,
              status: 'running',
              startedAt: new Date(device.updatedAt)
            });
            logger.info(`Processo para ${device.phoneNumber} ainda está rodando (PID: ${device.processId})`);
          } else {
            // Process is dead, update device status
            await deviceManager.updateDevice(device.phoneNumber, {
              processId: null,
              status: 'stopped'
            });
            logger.warn(`Processo para ${device.phoneNumber} não está mais rodando`);
          }
        }
      }
    } catch (error) {
      logger.error('Erro ao carregar processos existentes:', error);
    }
  }

  /**
   * Check if a process is still running
   * @param {number} pid - Process ID
   * @returns {Promise<boolean>} - True if process is running
   */
  async isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create and start a new WhatsApp process for a phone number
   * @param {string} phoneNumber - Phone number
   * @param {Object} options - Process options
   * @returns {Promise<Object>} - Process information
   */
  async startProcess(phoneNumber, options = {}) {
    // Check if process already exists
    if (this.processes.has(phoneNumber)) {
      throw new Error(`Processo para ${phoneNumber} já existe`);
    }

    // Get device information
    const device = await deviceManager.getDevice(phoneNumber);
    if (!device) {
      throw new Error(`Dispositivo ${phoneNumber} não está registrado`);
    }

    const devicePort = device.port || device.containerInfo?.port;
    if (!devicePort) {
      throw new Error(`Porta não definida para dispositivo ${phoneNumber}`);
    }

    logger.info(`Iniciando processo WhatsApp para ${phoneNumber} na porta ${devicePort}`);

    try {
      // Create session directory for this phone number
      const sessionPath = path.join('/app/sessions', phoneNumber);
      await this.ensureSessionDirectory(sessionPath);

      // Prepare environment variables
      const env = {
        ...process.env,
        APP_PORT: devicePort.toString(),
        APP_BASIC_AUTH: `${this.basicAuthUsername}:${this.basicAuthPassword}`,
        APP_DEBUG: 'true',
        APP_OS: 'Chrome',
        APP_ACCOUNT_VALIDATION: 'false',
        DB_URI: `file:${sessionPath}/whatsapp.db?_foreign_keys=on`,
        ...this.getEnvironmentVariables(options)
      };

      // Spawn the WhatsApp binary process
      const childProcess = spawn(this.binaryPath, ['rest'], {
        env,
        cwd: sessionPath,
        detached: false,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Handle process events
      childProcess.stdout.on('data', (data) => {
        logger.info(`WhatsApp ${phoneNumber}: ${data.toString().trim()}`);
      });

      childProcess.stderr.on('data', (data) => {
        logger.error(`WhatsApp ${phoneNumber} ERROR: ${data.toString().trim()}`);
      });

      childProcess.on('close', async (code) => {
        logger.info(`Processo WhatsApp ${phoneNumber} finalizado com código ${code}`);
        this.processes.delete(phoneNumber);
        await deviceManager.updateDevice(phoneNumber, { 
          processId: null,
          status: code === 0 ? 'stopped' : 'error' 
        });
      });

      childProcess.on('error', async (error) => {
        logger.error(`Erro no processo WhatsApp ${phoneNumber}:`, error);
        this.processes.delete(phoneNumber);
        await deviceManager.updateDevice(phoneNumber, { 
          processId: null,
          status: 'error' 
        });
      });

      // Store process reference
      const processInfo = {
        pid: childProcess.pid,
        process: childProcess,
        phoneNumber,
        port: devicePort,
        status: 'running',
        startedAt: new Date(),
        sessionPath
      };

      this.processes.set(phoneNumber, processInfo);

      // Update device manager
      await deviceManager.updateDevice(phoneNumber, {
        processId: childProcess.pid,
        status: 'active'
      });

      logger.info(`Processo WhatsApp iniciado para ${phoneNumber} (PID: ${childProcess.pid})`);
      
      return {
        pid: childProcess.pid,
        phoneNumber,
        port: devicePort,
        status: 'running'
      };

    } catch (error) {
      logger.error(`Erro ao iniciar processo para ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Stop a WhatsApp process
   * @param {string} phoneNumber - Phone number
   * @param {number} timeout - Stop timeout in seconds
   * @returns {Promise<boolean>} - Success status
   */
  async stopProcess(phoneNumber, timeout = 30) {
    const processInfo = this.processes.get(phoneNumber);
    if (!processInfo) {
      throw new Error(`Processo para ${phoneNumber} não encontrado`);
    }

    try {
      logger.info(`Parando processo WhatsApp para ${phoneNumber} (PID: ${processInfo.pid})`);
      
      // Send SIGTERM signal
      processInfo.process.kill('SIGTERM');
      
      // Wait for graceful shutdown with timeout
      const killed = await this.waitForProcessExit(processInfo.pid, timeout * 1000);
      
      if (!killed) {
        logger.warn(`Processo ${phoneNumber} não parou graciosamente, forçando término`);
        processInfo.process.kill('SIGKILL');
        await this.waitForProcessExit(processInfo.pid, 5000);
      }

      // Clean up references
      this.processes.delete(phoneNumber);
      await deviceManager.updateDevice(phoneNumber, { 
        processId: null,
        status: 'stopped' 
      });

      logger.info(`Processo WhatsApp para ${phoneNumber} parado com sucesso`);
      return true;
    } catch (error) {
      logger.error(`Erro ao parar processo para ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Wait for process to exit
   * @param {number} pid - Process ID
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<boolean>} - True if process exited, false if timeout
   */
  async waitForProcessExit(pid, timeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (!this.isProcessRunning(pid)) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Restart a WhatsApp process
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<boolean>} - Success status
   */
  async restartProcess(phoneNumber) {
    try {
      await this.stopProcess(phoneNumber);
      await this.startProcess(phoneNumber);
      return true;
    } catch (error) {
      logger.error(`Erro ao reiniciar processo para ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get process status
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object|null>} - Process status
   */
  async getProcessStatus(phoneNumber) {
    const processInfo = this.processes.get(phoneNumber);
    if (!processInfo) {
      return null;
    }

    try {
      const isRunning = await this.isProcessRunning(processInfo.pid);
      return {
        pid: processInfo.pid,
        status: isRunning ? 'running' : 'stopped',
        running: isRunning,
        startedAt: processInfo.startedAt,
        port: processInfo.port,
        phoneNumber,
        sessionPath: processInfo.sessionPath
      };
    } catch (error) {
      logger.error(`Erro ao obter status do processo ${phoneNumber}:`, error);
      return null;
    }
  }

  /**
   * List all managed processes
   * @returns {Promise<Array>} - List of processes
   */
  async listProcesses() {
    const processes = [];
    
    for (const [phoneNumber, processInfo] of this.processes) {
      try {
        const status = await this.getProcessStatus(phoneNumber);
        if (status) {
          processes.push(status);
        }
      } catch (error) {
        logger.error(`Erro ao obter status do processo ${phoneNumber}:`, error);
      }
    }

    return processes;
  }

  /**
   * Start health check monitoring
   */
  startHealthCheckMonitoring() {
    const interval = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000;
    
    setInterval(async () => {
      await this.performHealthChecks();
    }, interval);

    logger.info(`Monitoramento de health check iniciado (${interval}ms)`);
  }

  /**
   * Perform health checks on all processes
   */
  async performHealthChecks() {
    for (const [phoneNumber, processInfo] of this.processes) {
      try {
        const isRunning = await this.isProcessRunning(processInfo.pid);
        
        if (!isRunning && processInfo.status === 'running') {
          logger.warn(`Processo ${phoneNumber} parou inesperadamente`);
          this.processes.delete(phoneNumber);
          await deviceManager.updateDevice(phoneNumber, { 
            processId: null,
            status: 'error' 
          });
          
          // Emit event for monitoring
          if (global.socketIO) {
            global.socketIO.to(`device-${phoneNumber}`).emit('process-stopped', {
              phoneNumber,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        logger.error(`Erro no health check do processo ${phoneNumber}:`, error);
      }
    }
  }

  /**
   * Ensure session directory exists
   * @param {string} sessionPath - Session directory path
   */
  async ensureSessionDirectory(sessionPath) {
    try {
      await fs.mkdir(sessionPath, { recursive: true });
      await fs.chmod(sessionPath, 0o755);
    } catch (error) {
      logger.error(`Erro ao criar diretório de sessão ${sessionPath}:`, error);
      throw error;
    }
  }

  /**
   * Get environment variables for process
   * @param {Object} options - Process options
   * @returns {Object} - Environment variables
   */
  getEnvironmentVariables(options) {
    const defaultEnv = {
      NODE_ENV: process.env.NODE_ENV || 'production',
      LOG_LEVEL: process.env.LOG_LEVEL || 'info'
    };

    if (options.environment) {
      return { ...defaultEnv, ...options.environment };
    }

    return defaultEnv;
  }

  /**
   * Cleanup all processes
   */
  async cleanup() {
    logger.info('Iniciando cleanup dos processos WhatsApp...');
    
    const cleanupPromises = Array.from(this.processes.keys()).map(async (phoneNumber) => {
      try {
        await this.stopProcess(phoneNumber);
        logger.info(`Processo ${phoneNumber} parado durante cleanup`);
      } catch (error) {
        logger.error(`Erro ao parar processo ${phoneNumber} durante cleanup:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
    logger.info('Cleanup dos processos WhatsApp concluído');
  }
}

// Export singleton instance
module.exports = new BinaryManager();