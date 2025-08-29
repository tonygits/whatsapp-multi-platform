import { CronJob } from 'cron';
import axios from 'axios';
import logger from '../utils/logger';
import binaryManager from './binaryManager';

class UpdateManager {
  updateCheckCron: string;
  cronJob: any;
  lastUpdateCheck: Date | null;
  updateHistory: any[];
  autoUpdateEnabled: boolean;

  constructor() {
    this.updateCheckCron = process.env.UPDATE_CHECK_CRON || '0 2 * * *'; // 2 AM daily
    this.cronJob = null;
    this.lastUpdateCheck = null;
    this.updateHistory = [];
    this.autoUpdateEnabled = process.env.AUTO_UPDATE_ENABLED === 'true' || false;
  }

  /**
   * Initialize update manager and start scheduled checks
   */
  initialize() {
    logger.info('Inicializando Update Manager...');
    
    this.startScheduledChecks();
    
    // Check on startup (delayed)
    setTimeout(() => {
      this.performUpdateCheck();
     }, 30000); // Wait 30 seconds after startup

    logger.info('Update Manager inicializado');
  }

  /**
   * Start scheduled update checks
   */
  startScheduledChecks() {
    try {
      this.cronJob = new CronJob(
        this.updateCheckCron,
        () => this.performUpdateCheck(),
        null,
        true,
        'America/Sao_Paulo'
      );

      logger.info(`Verificações de atualização agendadas: ${this.updateCheckCron}`);
    } catch (error) {
      logger.error('Erro ao agendar verificações de atualização:', error);
    }
  }

  /**
   * Perform comprehensive update check
   */
  async performUpdateCheck() {
    logger.info('Iniciando verificação inteligente de atualizações...');
    
    this.lastUpdateCheck = new Date();
        const checkResults: any = {
          timestamp: this.lastUpdateCheck.toISOString(),
          checks: {} as any,
        };

    try {
      // Check Docker image updates
      checkResults.checks.dockerImages = await this.checkDockerImageUpdates();

      // Check Node.js dependencies
      checkResults.checks.nodeDependencies = await this.checkNodeDependencies();

      // Check WhatsApp library updates
      checkResults.checks.whatsappLibrary = await this.checkWhatsAppLibraryUpdates();

      // Check system packages
      checkResults.checks.systemPackages = await this.checkSystemPackages();

      // Check process health and recommend updates
      checkResults.checks.processHealth = await this.checkProcessHealthForUpdates();

      // Analyze update recommendations
      const recommendations = this.analyzeUpdateRecommendations(checkResults.checks);
      checkResults.recommendations = recommendations;

      // Store in history
      this.updateHistory.push(checkResults);
      
      // Keep only last 30 checks
      if (this.updateHistory.length > 30) {
        this.updateHistory = this.updateHistory.slice(-30);
      }

      // Send notifications if critical updates are available
      await this.sendUpdateNotifications(checkResults);

      // Auto-update if enabled and safe
      if (this.autoUpdateEnabled && recommendations.safeToAutoUpdate) {
        await this.performAutoUpdate(recommendations.autoUpdateActions);
      }

      logger.info('Verificação de atualizações concluída');
      return checkResults;

    } catch (error) {
      logger.error('Erro durante verificação de atualizações:', error);
            (checkResults as any).error = (error as Error).message;
      return checkResults;
    }
  }

  /**
   * Check for Docker image updates
   */
  async checkDockerImageUpdates() {
    const results = {
      images: [],
      updates_available: false,
      last_checked: new Date().toISOString()
    };

    try {
      const images = [
        'node:18-alpine',
        'golang:1.21-alpine',
        'alpine:latest'
      ];

      for (const image of images) {
        try {
          // Get local image info
          const localInfo = await this.getLocalImageInfo(image);
          
          // Check registry for updates
          const registryInfo = await this.getRegistryImageInfo(image);
          
          const updateAvailable = localInfo && registryInfo && 
            (localInfo as any).digest !== (registryInfo as any).digest;

          (results.images as any[]).push({
            name: image,
            local_digest: (localInfo as any)?.digest,
            registry_digest: (registryInfo as any)?.digest,
            update_available: updateAvailable,
            local_created: (localInfo as any)?.created,
            registry_updated: (registryInfo as any)?.last_updated
          });

          if (updateAvailable) {
            results.updates_available = true;
          }

        } catch (error) {
          logger.warn(`Erro ao verificar imagem ${image}:`, (error as any).message);
          (results.images as any[]).push({
            name: image,
            error: (error as Error).message
          });
        }
      }

    } catch (error) {
      logger.error('Erro ao verificar atualizações Docker:', error);
      (results as any).error = (error as Error).message;
    }

    return results;
  }

  /**
   * Check Node.js dependencies for updates
   */
  async checkNodeDependencies() {
    const results: any = {
      dependencies: [],
      updates_available: false,
      security_updates: false,
      security_vulnerabilities: undefined,
    };

    const { execSync } = require('child_process');
    let outdatedOutput = '';

    try {
      // This will succeed (exit code 0) only if NO packages are outdated.
      outdatedOutput = execSync('npm outdated --json', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });
    } catch (error) {
      // This block will execute if packages ARE outdated (exit code 1).
      // The JSON output is in error.stdout, which is what we want to parse.
      if ((error as any).stdout) {
        outdatedOutput = (error as any).stdout;
      } else {
        // This is a real error (e.g., npm not found or another issue).
        logger.warn('Erro ao executar "npm outdated":', error);
  (results as any).error = (error as any).message;
        return results; // Exit early
      }
    }

    if (outdatedOutput) {
      try {
        const outdated = JSON.parse(outdatedOutput);
        for (const [name, info] of Object.entries(outdated)) {
      const isSecurityUpdate = await this.checkPackageSecurityAdvisories(name, (info as any).current);
          
          results.dependencies.push({
            name,
            current: (info as any).current,
            wanted: (info as any).wanted,
            latest: (info as any).latest,
            security_update: isSecurityUpdate,
          });

          results.updates_available = true;
          if (isSecurityUpdate) {
            results.security_updates = true;
          }
        }
      } catch (parseError) {
          logger.warn('Erro ao fazer parse da saída do "npm outdated":', parseError);
          results.error = 'Failed to parse npm outdated JSON output.';
      }
    }

    // Check for security vulnerabilities using npm audit
    try {
      // This will succeed (exit code 0) if no vulnerabilities are found.
      execSync('npm audit --audit-level=moderate --json', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });
    } catch (auditError) {
      // This block executes if vulnerabilities ARE found.
      if ((auditError as any).stdout) {
        try {
          const audit = JSON.parse((auditError as any).stdout);
          if (audit.metadata && audit.metadata.vulnerabilities.total > 0) {
            (results as any).security_vulnerabilities = audit.metadata.vulnerabilities;
            (results as any).security_updates = true;
            logger.warn(`Vulnerabilidades de segurança encontradas: ${audit.metadata.vulnerabilities.total} total`);
          }
        } catch(parseError) {
          logger.warn('Erro ao fazer parse da saída do "npm audit":', parseError);
        }
      } else {
        // This is a real error.
        logger.warn('Erro ao executar "npm audit":', (auditError as any).message);
      }
    }

    return results;
  }

  /**
   * Check WhatsApp library updates
   */
  async checkWhatsAppLibraryUpdates() {
    const results = {
      current_version: null,
      latest_version: null,
      update_available: false,
      release_notes: null
    };

    try {
      // Check go-whatsapp-web-multidevice releases
      const response = await axios.get(
        'https://api.github.com/repos/aldinokemal/go-whatsapp-web-multidevice/releases/latest',
        { timeout: 10000 }
      );

      results.latest_version = response.data.tag_name;
      results.release_notes = response.data.body;
  (results as any).published_at = response.data.published_at;

      // Get current version from containers (if possible)
      // This would require implementing version tracking in containers
  (results as any).current_version = 'unknown';
      results.update_available = true; // Conservative approach

    } catch (error) {
  logger.warn('Erro ao verificar atualizações da biblioteca WhatsApp:', (error as any).message);
  (results as any).error = (error as any).message;
    }

    return results;
  }

  /**
   * Check system packages for updates
   */
  async checkSystemPackages() {
    const results = {
      packages: [],
      security_updates: false,
      updates_available: false
    };

    try {
      // This would require implementation based on the host OS
      // For Docker containers, this might not be as relevant
  (results as any).message = 'System package checks not implemented for containerized environment';
    } catch (error) {
  (results as any).error = (error as any).message;
    }

    return results;
  }

  /**
   * Check process health to recommend updates
   */
  async checkProcessHealthForUpdates() {
    const results = {
      processes: [],
      recommendations: []
    };

    try {
      const processes = await binaryManager.listProcesses();
      
      for (const process of processes) {
        const health = await this.analyzeProcessHealth(process);
        
  (results as any).processes.push({
          deviceHash: process.deviceHash,
          healthScore: health.score,
          uptime: health.uptime,
          restartRecommended: health.restartRecommended,
          updateRecommended: health.updateRecommended
        });

        if (health.restartRecommended) {
          (results as any).recommendations.push({
            type: 'restart',
            process: process.deviceHash,
            reason: health.restartReason
          });
        }

        if (health.updateRecommended) {
          (results as any).recommendations.push({
            type: 'update',
            process: process.deviceHash,
            reason: health.updateReason
          });
        }
      }

    } catch (error) {
      logger.error('Erro ao analisar saúde dos processos:', error);
  (results as any).error = (error as any).message;
    }

    return results;
  }

  /**
   * Analyze process health
   */
  async analyzeProcessHealth(process: any) {
    const health = {
      score: 100,
      uptime: 0,
      restartRecommended: false,
      updateRecommended: false,
      restartReason: null,
      updateReason: null
    };

    try {
      // Calculate uptime
      if (process.startedAt) {
        health.uptime = Date.now() - new Date(process.startedAt).getTime();
      }

      // Recommend restart if uptime > 7 days
      if (health.uptime > 7 * 24 * 60 * 60 * 1000) {
        health.restartRecommended = true;
  (health as any).restartReason = 'Process running for more than 7 days';
        health.score -= 20;
      }

      // Check if process is healthy
      if (!process.running) {
        health.score = 0;
        health.updateRecommended = true;
  (health as any).updateReason = 'Process not running';
      }

      // Additional health checks could be added here

    } catch (error) {
      logger.error(`Erro ao analisar processo ${process.deviceHash}:`, error);
      health.score = 0;
    }

    return health;
  }

  /**
   * Analyze update recommendations
   */
  analyzeUpdateRecommendations(checks: any) {
    const recommendations = {
      priority: 'low',
      safeToAutoUpdate: false,
      autoUpdateActions: [],
      manualActions: [],
      securityCritical: false
    };

    // Check for security updates
    if (checks.nodeDependencies?.security_updates || 
        checks.dockerImages?.security_updates) {
      recommendations.priority = 'high';
      recommendations.securityCritical = true;
    }

    // Check for critical process issues
    if (checks.processHealth?.recommendations?.length > 0) {
      const restartCount = checks.processHealth.recommendations
  .filter((r: any) => r.type === 'restart').length;
      
      if (restartCount > 0) {
        recommendations.priority = 'medium';
  (recommendations as any).autoUpdateActions.push({
          type: 'restart_processes',
          processes: checks.processHealth.recommendations
            .filter((r: any) => r.type === 'restart')
            .map((r: any) => r.process)
        });
        recommendations.safeToAutoUpdate = true;
      }
    }

    // Add manual actions for major updates
    if (checks.dockerImages?.updates_available) {
  (recommendations as any).manualActions.push({
        type: 'update_docker_images',
        description: 'Atualize as imagens Docker manualmente'
      });
    }

    if (checks.whatsappLibrary?.update_available) {
  (recommendations as any).manualActions.push({
        type: 'update_whatsapp_library',
        description: 'Nova versão da biblioteca WhatsApp disponível'
      });
    }

    return recommendations;
  }

  /**
   * Send update notifications
   */
  async sendUpdateNotifications(checkResults: any) {
    const { recommendations } = checkResults;

    if (recommendations.priority === 'high' || recommendations.securityCritical) {
      logger.warn('ATENÇÃO: Atualizações críticas de segurança disponíveis!');
      
      // Send via WebSocket if configured
  if ((global as any).webSocketServer) {
        const message = JSON.stringify({
          type: 'security-update-alert',
          severity: 'high',
          message: 'Atualizações críticas de segurança disponíveis',
          details: checkResults,
          timestamp: new Date().toISOString()
        });
        
  ((global as any).webSocketServer.clients as any[]).forEach((client: any) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
          }
        });
      }
    }

    if (recommendations.manualActions.length > 0) {
      logger.info(`${recommendations.manualActions.length} ações manuais recomendadas`);
    }
  }

  /**
   * Perform auto-update for safe actions
   */
  async performAutoUpdate(actions: any) {
    logger.info('Iniciando auto-update...');

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'restart_processes':
            await this.autoRestartProcesses(action.processes);
            break;

          default:
            logger.warn(`Ação de auto-update não reconhecida: ${action.type}`);
        }
      } catch (error) {
        logger.error(`Erro durante auto-update ${action.type}:`, error);
      }
    }

    logger.info('Auto-update concluído');
  }

  /**
   * Auto-restart processes
   */
  async autoRestartProcesses(deviceHashes: any) {
    for (const deviceHash of deviceHashes) {
      try {
        logger.info(`Auto-reiniciando processo: ${deviceHash}`);
        await binaryManager.restartProcess(deviceHash);
        
        // Wait between restarts
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        logger.error(`Erro ao reiniciar processo ${deviceHash}:`, error);
      }
    }
  }

  /**
   * Get local Docker image info
   */
  async getLocalImageInfo(imageName: any) {
    try {
      // Since we're not using containers anymore, this would need to be reimplemented
      // to check binary versions instead
      logger.warn('Docker image info check not applicable for binary deployment');
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get registry image info
   */
  async getRegistryImageInfo(imageName: any) {
    try {
      // This would require implementing Docker registry API calls
      // For now, return placeholder
      return {
        digest: 'unknown',
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Check package security advisories
   */
  async checkPackageSecurityAdvisories(packageName: any, version: any) {
    try {
      // This would require implementing security advisory checks
      // Could use GitHub Security Advisory API or npm audit
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get update history
   */
  getUpdateHistory(limit = 10) {
    return this.updateHistory.slice(-limit);
  }

  /**
   * Get current update status
   */
  getCurrentStatus() {
    return {
      last_check: this.lastUpdateCheck,
      schedule: this.updateCheckCron,
      auto_update_enabled: this.autoUpdateEnabled,
      checks_performed: this.updateHistory.length
    };
  }

  /**
   * Manually trigger update check
   */
  async manualUpdateCheck() {
    logger.info('Update check manual solicitado');
    return await this.performUpdateCheck();
  }

  /**
   * Stop scheduled checks
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Verificações de atualização paradas');
    }
  }
}

// Export singleton instance
export default new UpdateManager();