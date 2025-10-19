
import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import WebSocket from 'ws';
import logger from '../utils/logger';
import { BIN_PATH, SESSIONS_DIR } from '../utils/paths';
import deviceManager from './newDeviceManager';
import statusWebhookManager from './statusWebhookManager';

class BinaryManager {
  binaryPath: string;
  processes: Map<string, any>;
  websocketConnections: Map<string, any>;
  basicAuthUsername: string;
  basicAuthPassword: string;

  constructor() {
    this.binaryPath = BIN_PATH;
    this.processes = new Map(); // deviceHash -> process info
    this.websocketConnections = new Map(); // deviceHash -> websocket connection
    this.basicAuthUsername = process.env.DEFAULT_ADMIN_USER || 'admin';
    this.basicAuthPassword = process.env.DEFAULT_ADMIN_PASS || 'admin';
  }

  async initialize() {
    logger.info('Initializing Binary Manager...');
    try {
      // Check if binary exists and is executable
      await this.checkBinaryExists();
      logger.info('Starting loadExistingProcesses...');
      // Load existing processes from device manager
      await this.loadExistingProcesses();
      logger.info('loadExistingProcesses completed');
      // Start health check monitoring
      this.startHealthCheckMonitoring();
      logger.info('Binary Manager initialized successfully');
    } catch (error) {
      logger.error('Error initializing Binary Manager:', error);
      throw error;
    }
  }

  /**
   * Check if the WhatsApp binary exists and is executable
   */
  async checkBinaryExists() {
    try {
      await fs.access(this.binaryPath, fs.constants.F_OK | fs.constants.X_OK);
      logger.info(`WhatsApp binary found in: ${this.binaryPath}`);
    } catch (error) {
      throw new Error(`WhatsApp binary not found or not executable in: ${this.binaryPath}`);
    }
  }

  /**
   * Load existing processes and sync with device manager
   */
  async loadExistingProcesses() {
    try {
      const devices = await deviceManager.getAllDevices();
      logger.info(`Checking ${devices.length} registered devices`);
      for (const device of devices) {
  logger.info(`Device ${device.deviceHash}: processId=${(device as any).processId}, status=${device.status}`);
        // Check if device had an active session before restart
  if ((device as any).processId) {
          logger.info(`Checking if process ${(device as any).processId} is still running...`);
          // Check if process is still running (unlikely after container restart)
          const isRunning = await this.isProcessRunning((device as any).processId);
          if (isRunning) {
            this.processes.set(device.deviceHash, {
              pid: (device as any).processId,
              deviceHash: device.deviceHash,
              port: (device as any).port,
              status: 'running',
              startedAt: new Date(device.updatedAt)
            });
            logger.info(`Process for ${device.deviceHash} is still running (PID: ${(device as any).processId})`);
          } else {
            logger.info(`Process ${(device as any).processId} is no longer running, trying to restart...`);
            // Process is dead - try to restart if session files exist
            await this.restartSessionIfExists(device);
          }
        } else if (device.status === 'active') {
          logger.info(`Device ${device.deviceHash} marked as active with no process, trying to reboot...`);
          // Device is marked as active but has no process - try to restart
          await this.restartSessionIfExists(device);
        } else if (device.status === 'error' || device.status === 'stopped') {
          logger.info(`Device ${device.deviceHash} with status ${device.status}, checking for existing session...`);
          // Device has error/stopped status - check if session exists and restart
          await this.restartSessionIfExists(device);
        } else {
          logger.info(`Device ${device.deviceHash} does not need restart (status: ${device.status})`);
        }
      }
    } catch (error) {
      logger.error('Error loading existing processes:', error);
    }
  }

  /**
   * Restart session if session files exist
   * @param {Object} device - Device info
   */
  async restartSessionIfExists(device: any) {
    try {
      const sessionPath = path.join(SESSIONS_DIR, device.deviceHash);
      const sessionDbPath = path.join(sessionPath, 'whatsapp.db');
      
      // Check if session database exists (indicates previous session)
      const fs = require('fs').promises;
      try {
        await fs.access(sessionDbPath);
        logger.info(`Existing session detected for ${device.deviceHash}, automatically restarting...`);
        
        // Restart the process
        await this.startProcess(device.deviceHash);
        logger.info(`Process automatically restarted for ${device.deviceHash}`);
        
      } catch (accessError) {
        // Session doesn't exist, just update status to stopped
        logger.info(`No existing session for ${device.deviceHash}, marking as stopped`);
        await deviceManager.updateDevice(device.deviceHash, {
          processId: null,
          status: 'stopped'
        });
      }
    } catch (error) {
      logger.error(`Error while trying to reset session for ${device.deviceHash}:`, error);
      await deviceManager.updateDevice(device.deviceHash, {
        processId: null,
        status: 'error'
      });
    }
  }

  /**
   * Check if a process is still running
   * @param {number} pid - Process ID
   * @returns {Promise<boolean>} - True if process is running
   */
  async isProcessRunning(pid: number) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create and start a new WhatsApp process for a device
   * @param {string} deviceHash - Device hash
   * @param {Object} options - Process options
   * @returns {Promise<Object>} - Process information
   */
  async startProcess(deviceHash: string, options: any = {}) {
    // Check if process already exists
    if (this.processes.has(deviceHash)) {
      throw new Error(`Process for ${deviceHash} already exists`);
    }

    // Get device information
    const device = await deviceManager.getDevice(deviceHash);
    if (!device) {
      throw new Error(`Device ${deviceHash} is not registered`);
    }

  const devicePort = (device as any).port || (device as any).containerInfo?.port;
    if (!devicePort) {
      throw new Error(`Port not defined for device ${deviceHash}`);
    }

    logger.info(`Starting WhatsApp process for ${deviceHash} on port ${devicePort}`);

    try {
      // Create session directory for this device
      const sessionPath = path.join(SESSIONS_DIR, deviceHash);
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
        WHATSAPP_WEBHOOK: device.webhookUrl || '',
        WHATSAPP_WEBHOOK_SECRET: device.webhookSecret || '',
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
        logger.info(`WhatsApp ${deviceHash}: ${data.toString().trim()}`);
      });

      childProcess.stderr.on('data', (data) => {
        logger.error(`WhatsApp ${deviceHash} ERROR: ${data.toString().trim()}`);
      });

      childProcess.on('close', async (code) => {
        logger.info(`WhatsApp process ${deviceHash} completed with code ${code}`);
        this.processes.delete(deviceHash);
        await deviceManager.updateDevice(deviceHash, { 
          processId: null,
          status: code === 0 ? 'stopped' : 'error' 
        });
      });

      childProcess.on('error', async (error) => {
        logger.error(`Error in WhatsApp process ${deviceHash}:`, error);
        this.processes.delete(deviceHash);
        await deviceManager.updateDevice(deviceHash, { 
          processId: null,
          status: 'error' 
        });
      });

      // Store process reference
      const processInfo = {
        pid: childProcess.pid,
        process: childProcess,
        deviceHash,
        port: devicePort,
        status: 'running',
        startedAt: new Date(),
        sessionPath
      };

      this.processes.set(deviceHash, processInfo);

      // Update device manager
      await deviceManager.updateDevice(deviceHash, {
        processId: childProcess.pid,
        status: 'active'
      });

      logger.info(`WhatsApp process started to ${deviceHash} (PID: ${childProcess.pid})`);
      
      // Connect to container WebSocket
      setTimeout(() => {
        this.connectToContainerWebSocketWithRetry(deviceHash, devicePort);
      }, 5000);
      
      return {
        pid: childProcess.pid,
        deviceHash,
        port: devicePort,
        status: 'running'
      };

    } catch (error) {
      logger.error(`Error starting process for ${deviceHash}:`, error);
      throw error;
    }
  }

  /**
   * Stop a WhatsApp process
   * @param {string} deviceHash - Device hash
   * @param {number} timeout - Stop timeout in seconds
   * @returns {Promise<boolean>} - Success status
   */
  async stopProcess(deviceHash: string, timeout: number = 30) {
    const processInfo = this.processes.get(deviceHash);
    if (!processInfo) {
      throw new Error(`Process for ${deviceHash} not found`);
    }

    try {
      logger.info(`Stopping WhatsApp process for ${deviceHash} (PID: ${processInfo.pid})`);
      
      // Send SIGTERM signal
      processInfo.process.kill('SIGTERM');
      
      // Wait for graceful shutdown with timeout
      const killed = await this.waitForProcessExit(processInfo.pid, timeout * 1000);
      
      if (!killed) {
        logger.warn(`Process ${deviceHash} did not stop gracefully, forcing termination`);
        processInfo.process.kill('SIGKILL');
        await this.waitForProcessExit(processInfo.pid, 5000);
      }

      // Clean up references
      this.processes.delete(deviceHash);
      this.disconnectContainerWebSocket(deviceHash);
      await deviceManager.updateDevice(deviceHash, { 
        processId: null,
        status: 'stopped' 
      });

      logger.info(`WhatsApp process for ${deviceHash} stopped successfully`);
      return true;
    } catch (error) {
      logger.error(`Error stopping process for ${deviceHash}:`, error);
      throw error;
    }
  }

  /**
   * Wait for process to exit
   * @param {number} pid - Process ID
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<boolean>} - True if process exited, false if timeout
   */
  async waitForProcessExit(pid: number, timeout: number) {
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
   * @param {string} deviceHash - Device hash
   * @returns {Promise<boolean>} - Success status
   */
  async restartProcess(deviceHash: string) {
    try {
      await this.stopProcess(deviceHash);
      await this.startProcess(deviceHash);
      return true;
    } catch (error) {
      logger.error(`Error restarting process for ${deviceHash}:`, error);
      throw error;
    }
  }

  /**
   * Get process status
   * @param {string} deviceHash - Device hash
   * @returns {Promise<Object|null>} - Process status
   */
  async getProcessStatus(deviceHash: string) {
    const processInfo = this.processes.get(deviceHash);
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
        deviceHash,
        sessionPath: processInfo.sessionPath
      };
    } catch (error) {
      logger.error(`Error getting process status ${deviceHash}:`, error);
      return null;
    }
  }

  /**
   * List all managed processes
   * @returns {Promise<Array>} - List of processes
   */
  async listProcesses() {
    const processes = [];
    
    for (const [deviceHash, processInfo] of this.processes) {
      try {
        const status = await this.getProcessStatus(deviceHash);
        if (status) {
          processes.push(status);
        }
      } catch (error) {
        logger.error(`Error getting process status ${deviceHash}:`, error);
      }
    }

    return processes;
  }

  /**
   * Start health check monitoring
   */
  startHealthCheckMonitoring() {
  const interval = process.env.HEALTH_CHECK_INTERVAL ? parseInt(process.env.HEALTH_CHECK_INTERVAL) : 30000;
    
    setInterval(async () => {
      await this.performHealthChecks();
    }, interval);

    logger.info(`Health check monitoring started (${interval}ms)`);
  }

  /**
   * Perform health checks on all processes
   */
  async performHealthChecks() {
    for (const [deviceHash, processInfo] of this.processes) {
      try {
        const isRunning = await this.isProcessRunning(processInfo.pid);
        
        if (!isRunning && processInfo.status === 'running') {
            logger.warn(`Process ${deviceHash} stopped unexpectedly`);
          this.processes.delete(deviceHash);
          await deviceManager.updateDevice(deviceHash, { 
            processId: null,
            status: 'error' 
          });
          
          // Emit event for monitoring
          if ((global as any).webSocketServer) {
            const message = JSON.stringify({
              type: 'process-stopped',
              deviceHash,
              timestamp: new Date().toISOString()
            });
            
            (global as any).webSocketServer.clients.forEach((client: any) => {
              if (client.readyState === WebSocket.OPEN) {
                if (!client.deviceFilter || client.deviceFilter === deviceHash) {
                  client.send(message);
                }
              }
            });
          }
        }
      } catch (error) {
        logger.error(`Error in the process health check ${deviceHash}:`, error);
      }
    }
  }

  /**
   * Ensure session directory exists
   * @param {string} sessionPath - Session directory path
   */
  async ensureSessionDirectory(sessionPath: string) {
    try {
      await fs.mkdir(sessionPath, { recursive: true });
      await fs.chmod(sessionPath, 0o755);
    } catch (error) {
      logger.error(`Error creating session directory ${sessionPath}:`, error);
      throw error;
    }
  }

  /**
   * Get environment variables for process
   * @param {Object} options - Process options
   * @returns {Object} - Environment variables
   */
  getEnvironmentVariables(options: any) {
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
   * Connect to container WebSocket
   * @param {string} deviceHash - Device hash
   * @param {number} port - Container port
   */
  connectToContainerWebSocketWithRetry(deviceHash: string, port: number) {
    const wsUrl = `ws://localhost:${port}/ws`;
    
    try {
      logger.info(`Connecting to WebSocket ${deviceHash} em ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.basicAuthUsername}:${this.basicAuthPassword}`).toString('base64')}`
        }
      });
      
      ws.on('open', () => {
        logger.info(`WebSocket connected: ${deviceHash}`);
        this.websocketConnections.set(deviceHash, ws);
        this.setupWebSocketEvents(ws, deviceHash, port);
      });
      
      ws.on('error', (error) => {
        logger.warn(`WebSocket error ${deviceHash}: ${error.message}`);
        this.websocketConnections.delete(deviceHash);
      });
      
    } catch (error) {
      logger.error(`Error connecting to WebSocket ${deviceHash}:`, error);
    }
  }

  setupWebSocketEvents(ws: WebSocket, deviceHash: string, port: number) {
    // Notify WebSocket clients
  if ((global as any).webSocketServer) {
      const connectMessage = JSON.stringify({
        type: 'container-websocket-connected',
        deviceHash,
        port,
        timestamp: new Date().toISOString()
      });
      
  ((global as any).webSocketServer.clients as any[]).forEach((client: any) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(connectMessage);
        }
      });
    }
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Mirror to WebSocket clients
  if ((global as any).webSocketServer) {
          const wsMessage = JSON.stringify({
            type: 'whatsapp-websocket-message',
            deviceHash,
            port,
            message,
            timestamp: new Date().toISOString()
          });
          
          ((global as any).webSocketServer.clients as any[]).forEach((client: any) => {
            if (client.readyState === WebSocket.OPEN) {
              // Send to all clients, or filter by device if they joined a specific device
              if (!client.deviceFilter || client.deviceFilter === deviceHash) {
                client.send(wsMessage);
              }
            }
          });
        }
        
        // Send to status webhook if configured (non-blocking)
        statusWebhookManager.handleContainerEvent(deviceHash, message).catch(error => {
          logger.error(`Webhook error for ${deviceHash}:`, error.message);
        });
        
        logger.debug(`WebSocket message from ${deviceHash}:`, message);
      } catch (error) {
        logger.error(`Error processing WebSocket message from ${deviceHash}:`, error);
      }
    });
    
    ws.on('error', (error) => {
      logger.warn(`WebSocket error ${deviceHash}: ${error.message}`);
      this.websocketConnections.delete(deviceHash);
    });
    
    ws.on('close', (code, reason) => {
      logger.info(`WebSocket ${deviceHash} closed (${code}: ${reason})`);
      this.websocketConnections.delete(deviceHash);
      
  if ((global as any).webSocketServer) {
        const closeMessage = JSON.stringify({
          type: 'container-websocket-closed',
          deviceHash,
          port,
          code,
          reason: reason?.toString(),
          timestamp: new Date().toISOString()
        });
        
  ((global as any).webSocketServer.clients as any[]).forEach((client: any) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(closeMessage);
          }
        });
      }
    });
  }


  /**
   * Disconnect container WebSocket
   * @param {string} deviceHash - Device hash
   */
  disconnectContainerWebSocket(deviceHash: any) {
    const ws = this.websocketConnections.get(deviceHash);
    if (ws) {
      logger.info(`Disconnecting WebSocket from container ${deviceHash}`);
      ws.close();
      this.websocketConnections.delete(deviceHash);
    }
  }

  /**
   * Cleanup all processes
   */
  async cleanup() {
    logger.info('Starting cleanup of WhatsApp processes...');
    
    // Close all WebSocket connections
    for (const [deviceHash] of this.websocketConnections) {
      this.disconnectContainerWebSocket(deviceHash);
    }
    
    const cleanupPromises = Array.from(this.processes.keys()).map(async (deviceHash) => {
      try {
        await this.stopProcess(deviceHash);
        logger.info(`Process ${deviceHash} stopped during cleanup`);
      } catch (error) {
        logger.error(`Error stopping process ${deviceHash} during cleanup:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
    logger.info('WhatsApp process cleanup complete');
  }

}

const binaryManager = new BinaryManager();
export default binaryManager;
