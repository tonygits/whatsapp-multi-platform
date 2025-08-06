const Docker = require('dockerode');
const path = require('path');
const logger = require('../utils/logger');
const deviceManager = require('./newDeviceManager');

class ContainerManager {
  constructor() {
    this.docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });
    this.networkName = process.env.CONTAINER_NETWORK || 'whatsapp_network';
    this.imageName = process.env.WHATSAPP_IMAGE_NAME || 'aldinokemal2104/go-whatsapp-web-multidevice';
    this.basicAuthUsername = process.env.BASIC_AUTH_USERNAME || 'admin';
    this.basicAuthPassword = process.env.BASIC_AUTH_PASSWORD || 'admin';
    this.volumesBasePath = process.env.VOLUMES_BASE_PATH || './volumes';
    this.containers = new Map(); // phoneNumber -> container info
  }

  /**
   * Initialize the container manager
   */
  async initialize() {
    logger.info('Inicializando Container Manager...');
    
    try {
      // Check Docker connection
      await this.docker.ping();
      logger.info('Conexão com Docker estabelecida');

      // Ensure network exists
      await this.ensureNetwork();

      // Load existing containers
      await this.loadExistingContainers();

      // Start health check monitoring
      this.startHealthCheckMonitoring();

      logger.info('Container Manager inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar Container Manager:', error);
      throw error;
    }
  }

  /**
   * Ensure the Docker network exists
   */
  async ensureNetwork() {
    try {
      const networks = await this.docker.listNetworks();
      const networkExists = networks.some(network => network.Name === this.networkName);

      if (!networkExists) {
        logger.info(`Criando rede Docker: ${this.networkName}`);
        await this.docker.createNetwork({
          Name: this.networkName,
          Driver: 'bridge',
          IPAM: {
            Config: [{
              Subnet: '172.20.0.0/16'
            }]
          }
        });
        logger.info(`Rede ${this.networkName} criada com sucesso`);
      } else {
        logger.info(`Rede ${this.networkName} já existe`);
      }
    } catch (error) {
      logger.error('Erro ao verificar/criar rede Docker:', error);
      throw error;
    }
  }

  /**
   * Load existing containers and sync with device manager
   */
  async loadExistingContainers() {
    try {
      const containers = await this.docker.listContainers({ all: true });
      const whatsappContainers = containers.filter(container => 
        container.Image === this.imageName || 
        container.Names.some(name => name.includes('whatsapp-')) ||
        container.Labels['whatsapp.managed_by'] === 'gateway'
      );

      logger.info(`Encontrados ${whatsappContainers.length} containers WhatsApp existentes`);

      for (const containerInfo of whatsappContainers) {
        const container = this.docker.getContainer(containerInfo.Id);
        const inspect = await container.inspect();
        
        // Extract phone number from environment or labels
        const phoneNumber = this.extractPhoneNumber(inspect);
        
        if (phoneNumber) {
          this.containers.set(phoneNumber, {
            id: containerInfo.Id,
            container,
            status: containerInfo.State,
            port: this.extractPort(inspect),
            phoneNumber
          });

          // Update device manager
          const deviceExists = await deviceManager.getDevice(phoneNumber);
          if (deviceExists) {
            await deviceManager.updateDevice(phoneNumber, {
              containerId: containerInfo.Id,
              status: containerInfo.State === 'running' ? 'active' : 'stopped'
            });
            logger.info(`Container para ${phoneNumber} carregado (${containerInfo.State})`);
          } else {
            logger.warn(`Container para ${phoneNumber} encontrado, mas dispositivo não está no banco de dados. Ignorando.`);
          }
        }
      }
    } catch (error) {
      logger.error('Erro ao carregar containers existentes:', error);
    }
  }

  /**
   * Create a new container for a phone number
   * @param {string} phoneNumber - Phone number
   * @param {Object} options - Container options
   * @returns {Promise<Object>} - Container information
   */
  async createContainer(phoneNumber, options = {}) {
    
      // Check if container already exists
      if (this.containers.has(phoneNumber)) {
        throw new Error(`Container para ${phoneNumber} já existe`);
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

      logger.info(`Criando container para ${phoneNumber} na porta ${devicePort}`);

      try {
        const containerName = `whatsapp-${phoneNumber}`;
        const volumeName = `whatsapp_volume_${phoneNumber}`;

        // Ensure Docker volume exists
        try {
          await this.docker.getVolume(volumeName).inspect();
          logger.info(`Volume Docker ${volumeName} já existe.`);
        } catch (e) {
          logger.info(`Criando volume Docker: ${volumeName}`);
          await this.docker.createVolume({ name: volumeName });
          logger.info(`Volume ${volumeName} criado com sucesso.`);
        }
        
        // Container configuration
        const containerConfig = {
          Image: this.imageName,
          name: containerName,
          Env: [
            `APP_PORT=${devicePort}`,
            `APP_BASIC_AUTH=${this.basicAuthUsername}:${this.basicAuthPassword}`,
            `APP_DEBUG=true`,
            `APP_OS=Chrome`,
            `APP_ACCOUNT_VALIDATION=false`,
            ...this.getEnvironmentVariables(options)
          ],
          ExposedPorts: {
            [`${devicePort}/tcp`]: {}
          },
          HostConfig: {
            PortBindings: {
              [`${devicePort}/tcp`]: [{ HostPort: devicePort.toString() }]
            },
            Binds: [
              `${volumeName}:/app/storages:rw`
            ],
            NetworkMode: this.networkName,
            RestartPolicy: {
              Name: 'always'
            },
            Memory: 512 * 1024 * 1024, // 512MB
            CpuShares: 512
          },
          Labels: {
            'whatsapp.phone_number': phoneNumber,
            'whatsapp.managed_by': 'gateway',
            'whatsapp.created_at': new Date().toISOString()
          },
          AttachStdout: false,
          AttachStderr: false,
          Cmd: ['rest'],
          ...options.containerConfig
        };

        // Create container
        const container = await this.docker.createContainer(containerConfig);
        const inspect = await container.inspect();

        // Store container reference
        this.containers.set(phoneNumber, {
          id: inspect.Id,
          container,
          status: 'created',
          port: devicePort,
          phoneNumber,
          createdAt: new Date()
        });

        // Update device manager
        await deviceManager.updateDevice(phoneNumber, {
          containerId: inspect.Id,
          status: 'created'
        });

        logger.info(`Container ${inspect.Id} criado para ${phoneNumber}`);
        return {
          id: inspect.Id,
          phoneNumber,
          port: device.port,
          status: 'created'
        };

      } catch (error) {
        logger.error(`Erro ao criar container para ${phoneNumber}:`, error);
        throw error;
      }
  }

  /**
   * Start a container
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<boolean>} - Success status
   */
  async startContainer(phoneNumber) {
    const containerInfo = this.containers.get(phoneNumber);
    if (!containerInfo) {
      throw new Error(`Container para ${phoneNumber} não encontrado`);
    }

    try {
      logger.info(`Iniciando container para ${phoneNumber}`);
      
      await containerInfo.container.start();
      
      // Update status
      containerInfo.status = 'running';
      await deviceManager.updateDevice(phoneNumber, { status: 'active' });

      logger.info(`Container para ${phoneNumber} iniciado com sucesso`);
      return true;
    } catch (error) {
      logger.error(`Erro ao iniciar container para ${phoneNumber}:`, error);
      await deviceManager.updateDevice(phoneNumber, { status: 'error' });
      throw error;
    }
  }

  /**
   * Stop a container
   * @param {string} phoneNumber - Phone number
   * @param {number} timeout - Stop timeout in seconds
   * @returns {Promise<boolean>} - Success status
   */
  async stopContainer(phoneNumber, timeout = 30) {
    const containerInfo = this.containers.get(phoneNumber);
    if (!containerInfo) {
      throw new Error(`Container para ${phoneNumber} não encontrado`);
    }

    try {
      logger.info(`Parando container para ${phoneNumber}`);
      
      await containerInfo.container.stop({ t: timeout });
      
      // Update status
      containerInfo.status = 'stopped';
      await deviceManager.updateDevice(phoneNumber, { status: 'stopped' });

      logger.info(`Container para ${phoneNumber} parado com sucesso`);
      return true;
    } catch (error) {
      logger.error(`Erro ao parar container para ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Remove a container
   * @param {string} phoneNumber - Phone number
   * @param {boolean} force - Force removal
   * @returns {Promise<boolean>} - Success status
   */
  async removeContainer(phoneNumber, force = false) {
    const containerInfo = this.containers.get(phoneNumber);
    if (!containerInfo) {
      return false;
    }

    try {
      logger.info(`Removendo container para ${phoneNumber}`);
      
      // Stop if running
      if (containerInfo.status === 'running') {
        await this.stopContainer(phoneNumber);
      }

      // Remove container
      await containerInfo.container.remove({ force });

      // Remove associated volume
      const volumeName = `whatsapp_volume_${phoneNumber}`;
      try {
        const volume = this.docker.getVolume(volumeName);
        await volume.remove();
        logger.info(`Volume Docker ${volumeName} removido com sucesso.`);
      } catch (e) {
        logger.warn(`Não foi possível remover o volume ${volumeName}: ${e.message}`);
      }
      
      // Clean up references
      this.containers.delete(phoneNumber);
      await deviceManager.updateDevice(phoneNumber, { 
        containerId: null,
        status: 'registered' 
      });

      logger.info(`Container para ${phoneNumber} removido com sucesso`);
      return true;
    } catch (error) {
      logger.error(`Erro ao remover container para ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get container status
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object|null>} - Container status
   */
  async getContainerStatus(phoneNumber) {
    const containerInfo = this.containers.get(phoneNumber);
    if (!containerInfo) {
      return null;
    }

    try {
      const inspect = await containerInfo.container.inspect();
      return {
        id: inspect.Id,
        status: inspect.State.Status,
        running: inspect.State.Running,
        startedAt: inspect.State.StartedAt,
        finishedAt: inspect.State.FinishedAt,
        port: containerInfo.port,
        phoneNumber,
        health: inspect.State.Health
      };
    } catch (error) {
      logger.error(`Erro ao obter status do container ${phoneNumber}:`, error);
      return null;
    }
  }

  /**
   * List all managed containers
   * @returns {Promise<Array>} - List of containers
   */
  async listContainers() {
    const containers = [];
    
    for (const [phoneNumber, containerInfo] of this.containers) {
      try {
        const status = await this.getContainerStatus(phoneNumber);
        if (status) {
          containers.push(status);
        }
      } catch (error) {
        logger.error(`Erro ao obter status do container ${phoneNumber}:`, error);
      }
    }

    return containers;
  }

  /**
   * Restart a container
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<boolean>} - Success status
   */
  async restartContainer(phoneNumber) {
    try {
      await this.stopContainer(phoneNumber);
      await this.startContainer(phoneNumber);
      return true;
    } catch (error) {
      logger.error(`Erro ao reiniciar container para ${phoneNumber}:`, error);
      throw error;
    }
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
   * Perform health checks on all containers
   */
  async performHealthChecks() {
    for (const [phoneNumber, containerInfo] of this.containers) {
      try {
        const status = await this.getContainerStatus(phoneNumber);
        
        if (status && !status.running && containerInfo.status === 'running') {
          logger.warn(`Container ${phoneNumber} parou inesperadamente`);
          await deviceManager.updateDevice(phoneNumber, { status: 'error' });
          
          // Emit event for monitoring
          if (global.socketIO) {
            global.socketIO.to(`device-${phoneNumber}`).emit('container-stopped', {
              phoneNumber,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        logger.error(`Erro no health check do container ${phoneNumber}:`, error);
      }
    }
  }

  /**
   * Ensure session directory exists
   * @param {string} sessionPath - Session directory path
   */
  async ensureSessionDirectory(sessionPath) {
    const fs = require('fs').promises;
    try {
      await fs.mkdir(sessionPath, { recursive: true });
      await fs.chmod(sessionPath, 0o755);
    } catch (error) {
      logger.error(`Erro ao criar diretório de sessão ${sessionPath}:`, error);
      throw error;
    }
  }

  /**
   * Extract phone number from container inspection
   * @param {Object} inspect - Container inspection data
   * @returns {string|null} - Phone number
   */
  extractPhoneNumber(inspect) {
    // Try labels first
    if (inspect.Config.Labels && inspect.Config.Labels['whatsapp.phone_number']) {
      return inspect.Config.Labels['whatsapp.phone_number'];
    }

    // Try environment variables
    if (inspect.Config.Env) {
      for (const env of inspect.Config.Env) {
        if (env.startsWith('PHONE_NUMBER=')) {
          return env.split('=')[1];
        }
      }
    }

    return null;
  }

  /**
   * Extract port from container inspection
   * @param {Object} inspect - Container inspection data
   * @returns {number|null} - Port number
   */
  extractPort(inspect) {
    if (inspect.HostConfig.PortBindings) {
      for (const [containerPort, hostBindings] of Object.entries(inspect.HostConfig.PortBindings)) {
        if (hostBindings && hostBindings[0]) {
          return parseInt(hostBindings[0].HostPort);
        }
      }
    }
    return null;
  }

  /**
   * Get environment variables for container
   * @param {Object} options - Container options
   * @returns {Array} - Environment variables
   */
  getEnvironmentVariables(options) {
    const defaultEnv = [
      `NODE_ENV=${process.env.NODE_ENV || 'production'}`,
      `LOG_LEVEL=${process.env.LOG_LEVEL || 'info'}`
    ];

    if (options.environment) {
      return [...defaultEnv, ...options.environment];
    }

    return defaultEnv;
  }

  /**
   * Cleanup all containers
   */
  async cleanup() {
    logger.info('Iniciando cleanup dos containers...');
    
    const cleanupPromises = Array.from(this.containers.keys()).map(async (phoneNumber) => {
      try {
        await this.stopContainer(phoneNumber);
        logger.info(`Container ${phoneNumber} parado durante cleanup`);
      } catch (error) {
        logger.error(`Erro ao parar container ${phoneNumber} durante cleanup:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
    logger.info('Cleanup dos containers concluído');
  }
}

// Export singleton instance
module.exports = new ContainerManager();