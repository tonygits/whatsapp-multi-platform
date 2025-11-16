import {spawn, exec} from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import WebSocket from 'ws';
import logger from '../utils/logger';
import {BIN_PATH, SESSIONS_DIR} from '../utils/paths';
import deviceManager from './deviceManager';
import statusWebhookManager from './statusWebhookManager';

class BinaryManager {
    binaryPath: string;
    processes: Map<string, any>;
    websocketConnections: Map<string, any>;
    basicAuthUsername: string;
    basicAuthPassword: string;
    isShuttingDown: boolean = false;

    constructor() {
        this.binaryPath = BIN_PATH;
        this.processes = new Map(); // numberHash -> process info
        this.websocketConnections = new Map(); // numberHash -> websocket connection
        this.basicAuthUsername = process.env.DEFAULT_ADMIN_USER || 'admin';
        this.basicAuthPassword = process.env.DEFAULT_ADMIN_PASS || 'admin';
        // Register handlers for system shutdown
        process.on('SIGINT', this.prepareForShutdown.bind(this));
        process.on('SIGTERM', this.prepareForShutdown.bind(this));
    }

    /**
     * Prepares the system for shutdown, preventing active sessions from being marked as stopped
     */

    prepareForShutdown() {
        logger.info('System in shutdown process, maintaining active session status');
        this.isShuttingDown = true;
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
                logger.info(`Device ${device.numberHash}: processId=${(device as any).processId}, status=${device.status}`);
                // Check if device had an active session before restart
                if ((device as any).processId) {
                    logger.info(`Checking if process ${(device as any).processId} is still running...`);
                    // Check if process is still running (unlikely after container restart)
                    const isRunning = await this.isProcessRunning((device as any).processId);
                    if (isRunning) {
                        this.processes.set(device.numberHash, {
                            pid: (device as any).processId,
                            numberHash: device.numberHash,
                            port: (device as any).port,
                            status: 'running',
                            startedAt: new Date(device.updatedAt)
                        });
                        logger.info(`Process for ${device.numberHash} is still running (PID: ${(device as any).processId})`);
                    } else {
                        logger.info(`Process ${(device as any).processId} is no longer running, trying to restart...`);
                        // Process is dead - try to restart if session files exist
                        await this.restartSessionIfExists(device);
                    }
                } else if (device.status === 'active' || device.status === 'connected') {
                    logger.info(`Device ${device.numberHash} marked as active with no process, trying to reboot...`);
                    // Device is marked as active/connected but has no process - try to restart
                    await this.restartSessionIfExists(device);
                } else if (device.status === 'error' || device.status === 'stopped') {
                    logger.info(`Device ${device.numberHash} with status ${device.status}, checking for existing session...`);
                    // Device has error/stopped status - check if session exists and restart
                    await this.restartSessionIfExists(device);
                } else {
                    logger.info(`Device ${device.numberHash} does not need restart (status: ${device.status})`);
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
            const sessionPath = path.join(SESSIONS_DIR, device.numberHash);
            const sessionDbPath = path.join(sessionPath, 'whatsapp.db');

            // Determine if we are using an external database
            const usingExternalDB = !!process.env.DB_URI;

            // External DB: always restart the process
            if (usingExternalDB) {
                logger.info(`Using external database for ${device.numberHash}, restarting process...`);
                await this.startProcess(device.numberHash);
                logger.info(`Process automatically restarted for ${device.numberHash} (external DB)`);
                return;
            }

            // Local DB: if it was active/connected, start the process even without a local session
            if (device.status === 'active' || device.status === 'connected') {
                logger.info(`Device ${device.numberHash} was '${device.status}', starting process even without local session`);
                await this.startProcess(device.numberHash);
                return;
            }

            // For stopped/error: start only if local session exists
            try {
                await fs.access(sessionDbPath);
                logger.info(`Local session detected for ${device.numberHash}, restarting...`);

                // Restart the process
                await this.startProcess(device.numberHash);
            } catch {
                logger.info(`Local session not found for ${device.numberHash}; holding status '${device.status || 'stopped'}'`);
                // do not change status here; keep the existing one
            }
        } catch (error) {
            logger.error(`Error while trying to reset session for ${device.numberHash}:`, error);
            await deviceManager.updateDevice(device.numberHash, {
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
     * @param {string} numberHash - Device hash
     * @param {Object} options - Process options
     * @returns {Promise<Object>} - Process information
     */
    async startProcess(numberHash: string, options: any = {}) {
        // Check if process already exists
        if (this.processes.has(numberHash)) {
            // Check if the process is actually still running
            const processInfo = this.processes.get(numberHash);
            const isRunning = processInfo.pid ? await this.isProcessRunning(processInfo.pid) : false;

            if (isRunning) {
                logger.warn(`Process for ${numberHash} already exists and is running (PID: ${processInfo.pid})`);

                // Return existing process information instead of throwing an error
                return {
                    pid: processInfo.pid,
                    numberHash,
                    port: processInfo.port,
                    status: 'running',
                    alreadyRunning: true
                };
            } else {
                // Process is registered but not running, remove from list
                logger.info(`Process for ${numberHash} was registered but not running, removing reference`);
                this.processes.delete(numberHash);
            }
        }

        // Get device information
        const device = await deviceManager.getDevice(numberHash);
        if (!device) {
            throw new Error(`Device ${numberHash} is not registered`);
        }

        const devicePort = (device as any).port || (device as any).containerInfo?.port;
        if (!devicePort) {
            throw new Error(`Port not defined for device ${numberHash}`);
        }

        logger.info(`Starting WhatsApp process for ${numberHash} on port ${devicePort}`);

        try {
            // Determine if we are using an external database
            const usingExternalDB = !!process.env.DB_URI;
            // Initialize sessionPath only if not using external database
            const sessionPath = path.join(SESSIONS_DIR, numberHash);
            // If you are not using an external database, ensure that the session directory exists
            if(!usingExternalDB) await this.ensureSessionDirectory(sessionPath);

            // Prepare environment variables
            const env = {
                ...process.env,
                APP_PORT: devicePort.toString(),
                APP_BASIC_AUTH: `${this.basicAuthUsername}:${this.basicAuthPassword}`,
                APP_DEBUG: 'true',
                APP_OS: 'Chrome',
                APP_ACCOUNT_VALIDATION: 'false',
                DB_URI: process.env.DB_URI || `file:${sessionPath}/whatsapp.db?_foreign_keys=on`,
                WHATSAPP_WEBHOOK: device.webhookUrl || '',
                WHATSAPP_WEBHOOK_SECRET: device.webhookSecret || '',
                ...this.getEnvironmentVariables(options)
            };

            // Spawn the WhatsApp binary process
            const childProcess = spawn(this.binaryPath, ['rest'], {
                env,
                cwd: usingExternalDB ? process.cwd() : sessionPath,
                detached: false,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Handle process events
            childProcess.stdout.on('data', (data) => {
                logger.info(`WhatsApp ${numberHash}: ${data.toString().trim()}`);
            });

            childProcess.stderr.on('data', (data) => {
                logger.error(`WhatsApp ${numberHash} ERROR: ${data.toString().trim()}`);
            });

            childProcess.on('close', async (code) => {
                logger.info(`WhatsApp process ${numberHash} completed with code ${code}`);
                this.processes.delete(numberHash);
                // Do not change the status if the system is shutting down
                // This prevents active sessions from being marked as stopped during reboot
                if (!this.isShuttingDown) {
                    await deviceManager.updateDevice(numberHash, {
                        processId: null,
                        status: code === 0 ? 'stopped' : 'error'
                    });
                } else {
                    logger.info(`System shutting down, maintaining current status for ${numberHash}`);
                }
            });

            childProcess.on('error', async (error) => {
                logger.error(`Error in WhatsApp process ${numberHash}:`, error);
                this.processes.delete(numberHash);
                await deviceManager.updateDevice(numberHash, {
                    processId: null,
                    status: 'error'
                });
            });

            // Store process reference
            const processInfo = {
                pid: childProcess.pid,
                process: childProcess,
                numberHash,
                port: devicePort,
                status: 'running',
                startedAt: new Date(),
                sessionPath
            };

            this.processes.set(numberHash, processInfo);

            // Update device manager
            await deviceManager.updateDevice(numberHash, {
                processId: childProcess.pid,
                status: 'active'
            });

            logger.info(`WhatsApp process started to ${numberHash} (PID: ${childProcess.pid})`);

            // Connect to container WebSocket
            setTimeout(() => {
                this.connectToContainerWebSocketWithRetry(numberHash, devicePort);
            }, 5000);

            return {
                pid: childProcess.pid,
                numberHash,
                port: devicePort,
                status: 'running'
            };

        } catch (error) {
            logger.error(`Error starting process for ${numberHash}:`, error);
            throw error;
        }
    }

    /**
     * Stop a WhatsApp process
     * @param {string} numberHash - Device hash
     * @param {number} timeout - Stop timeout in seconds
     * @returns {Promise<boolean>} - Success status
     */
    async stopProcess(numberHash: string, timeout: number = 30) {
        const processInfo = this.processes.get(numberHash);
        if (!processInfo) {
            throw new Error(`Process for ${numberHash} not found`);
        }

        try {
            logger.info(`Stopping WhatsApp process for ${numberHash} (PID: ${processInfo.pid})`);

            // Send SIGTERM signal
            processInfo.process.kill('SIGTERM');

            // Wait for graceful shutdown with timeout
            const killed = await this.waitForProcessExit(processInfo.pid, timeout * 1000);

            if (!killed) {
                logger.warn(`Process ${numberHash} did not stop gracefully, forcing termination`);
                processInfo.process.kill('SIGKILL');
                await this.waitForProcessExit(processInfo.pid, 5000);
            }

            // Clean up references
            this.processes.delete(numberHash);
            this.disconnectContainerWebSocket(numberHash);
            await deviceManager.updateDevice(numberHash, {
                processId: null,
                status: 'stopped'
            });

            logger.info(`WhatsApp process for ${numberHash} stopped successfully`);
            return true;
        } catch (error) {
            logger.error(`Error stopping process for ${numberHash}:`, error);
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
     * @param {string} numberHash - Device hash
     * @returns {Promise<boolean>} - Success status
     */
    async restartProcess(numberHash: string) {
        try {
            await this.stopProcess(numberHash);
            await this.startProcess(numberHash);
            return true;
        } catch (error) {
            logger.error(`Error restarting process for ${numberHash}:`, error);
            throw error;
        }
    }

    /**
     * Get process status
     * @param {string} numberHash - Device hash
     * @returns {Promise<Object|null>} - Process status
     */
    async getProcessStatus(numberHash: string) {
        const processInfo = this.processes.get(numberHash);
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
                numberHash,
                sessionPath: processInfo.sessionPath
            };
        } catch (error) {
            logger.error(`Error getting process status ${numberHash}:`, error);
            return null;
        }
    }

    /**
     * List all managed processes
     * @returns {Promise<Array>} - List of processes
     */
    async listProcesses() {
        const processes = [];

        for (const [numberHash, processInfo] of this.processes) {
            try {
                const status = await this.getProcessStatus(numberHash);
                if (status) {
                    processes.push(status);
                }
            } catch (error) {
                logger.error(`Error getting process status ${numberHash}:`, error);
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
        for (const [numberHash, processInfo] of this.processes) {
            try {
                const isRunning = await this.isProcessRunning(processInfo.pid);

                if (!isRunning && processInfo.status === 'running') {
                    logger.warn(`Process ${numberHash} stopped unexpectedly`);
                    this.processes.delete(numberHash);
                    await deviceManager.updateDevice(numberHash, {
                        processId: null,
                        status: 'error'
                    });

                    // Emit event for monitoring
                    if ((global as any).webSocketServer) {
                        const message = JSON.stringify({
                            type: 'process-stopped',
                            numberHash,
                            timestamp: new Date().toISOString()
                        });

                        (global as any).webSocketServer.clients.forEach((client: any) => {
                            if (client.readyState === WebSocket.OPEN) {
                                if (!client.deviceFilter || client.deviceFilter === numberHash) {
                                    client.send(message);
                                }
                            }
                        });
                    }
                }
            } catch (error) {
                logger.error(`Error in the process health check ${numberHash}:`, error);
            }
        }
    }

    /**
     * Ensure session directory exists
     * @param {string} sessionPath - Session directory path
     */
    async ensureSessionDirectory(sessionPath: string) {
        try {
            await fs.mkdir(sessionPath, {recursive: true});
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
            return {...defaultEnv, ...options.environment};
        }

        return defaultEnv;
    }

    /**
     * Connect to container WebSocket
     * @param {string} numberHash - Device hash
     * @param {number} port - Container port
     */
    connectToContainerWebSocketWithRetry(numberHash: string, port: number) {
        const wsUrl = `ws://localhost:${port}/ws`;

        try {
            logger.info(`Connecting to WebSocket ${numberHash} em ${wsUrl}`);

            const ws = new WebSocket(wsUrl, {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${this.basicAuthUsername}:${this.basicAuthPassword}`).toString('base64')}`
                }
            });

            ws.on('open', () => {
                logger.info(`WebSocket connected: ${numberHash}`);
                this.websocketConnections.set(numberHash, ws);
                this.setupWebSocketEvents(ws, numberHash, port);
            });

            ws.on('error', (error) => {
                logger.warn(`WebSocket error ${numberHash}: ${error.message}`);
                this.websocketConnections.delete(numberHash);
            });

        } catch (error) {
            logger.error(`Error connecting to WebSocket ${numberHash}:`, error);
        }
    }

    setupWebSocketEvents(ws: WebSocket, numberHash: string, port: number) {
        // Notify WebSocket clients
        if ((global as any).webSocketServer) {
            const connectMessage = JSON.stringify({
                type: 'container-websocket-connected',
                numberHash,
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
                        numberHash,
                        port,
                        message,
                        timestamp: new Date().toISOString()
                    });

                    ((global as any).webSocketServer.clients as any[]).forEach((client: any) => {
                        if (client.readyState === WebSocket.OPEN) {
                            // Send to all clients, or filter by device if they joined a specific device
                            if (!client.deviceFilter || client.deviceFilter === numberHash) {
                                client.send(wsMessage);
                            }
                        }
                    });
                }

                // Send to status webhook if configured (non-blocking)
                statusWebhookManager.handleContainerEvent(numberHash, message).catch(error => {
                    logger.error(`Webhook error for ${numberHash}:`, error.message);
                });

                logger.debug(`WebSocket message from ${numberHash}:`, message);
            } catch (error) {
                logger.error(`Error processing WebSocket message from ${numberHash}:`, error);
            }
        });

        ws.on('error', (error) => {
            logger.warn(`WebSocket error ${numberHash}: ${error.message}`);
            this.websocketConnections.delete(numberHash);
        });

        ws.on('close', (code, reason) => {
            logger.info(`WebSocket ${numberHash} closed (${code}: ${reason})`);
            this.websocketConnections.delete(numberHash);

            if ((global as any).webSocketServer) {
                const closeMessage = JSON.stringify({
                    type: 'container-websocket-closed',
                    numberHash,
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
     * @param {string} numberHash - Device hash
     */
    disconnectContainerWebSocket(numberHash: any) {
        const ws = this.websocketConnections.get(numberHash);
        if (ws) {
            logger.info(`Disconnecting WebSocket from container ${numberHash}`);
            ws.close();
            this.websocketConnections.delete(numberHash);
        }
    }

    /**
     * Cleanup all processes
     */
    async cleanup() {
        logger.info('Starting cleanup of WhatsApp processes...');

        // Close all WebSocket connections
        for (const [numberHash] of this.websocketConnections) {
            this.disconnectContainerWebSocket(numberHash);
        }

        const cleanupPromises = Array.from(this.processes.keys()).map(async (numberHash) => {
            try {
                await this.stopProcess(numberHash);
                logger.info(`Process ${numberHash} stopped during cleanup`);
            } catch (error) {
                logger.error(`Error stopping process ${numberHash} during cleanup:`, error);
            }
        });

        await Promise.allSettled(cleanupPromises);
        logger.info('WhatsApp process cleanup complete');
    }

}

const binaryManager = new BinaryManager();
export default binaryManager;
