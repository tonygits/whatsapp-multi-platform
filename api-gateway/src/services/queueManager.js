const PQueue = require('p-queue');
const logger = require('../utils/logger');

class QueueManager {
  constructor() {
    this.queues = new Map(); // phoneNumber -> PQueue instance
    this.defaultOptions = {
      concurrency: 1, // One message at a time per number
      interval: 1000, // 1 second between messages
      intervalCap: 1, // 1 message per interval
      timeout: 30000, // 30 seconds timeout
      throwOnTimeout: true
    };
    this.stats = new Map(); // phoneNumber -> stats
  }

  /**
   * Get or create a queue for a phone number
   * @param {string} phoneNumber - Phone number
   * @param {Object} options - Queue options
   * @returns {PQueue} - Queue instance
   */
  getQueue(phoneNumber, options = {}) {
    if (!this.queues.has(phoneNumber)) {
      const queueOptions = { ...this.defaultOptions, ...options };
      const queue = new PQueue(queueOptions);
      
      // Set up queue event handlers
      this.setupQueueEvents(queue, phoneNumber);
      
      this.queues.set(phoneNumber, queue);
      this.stats.set(phoneNumber, {
        created: new Date(),
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        lastActivity: new Date()
      });

      logger.debug(`Fila criada para ${phoneNumber}`);
    }

    return this.queues.get(phoneNumber);
  }

  /**
   * Add a message to the queue
   * @param {string} phoneNumber - Phone number
   * @param {Function} messageFunction - Function that sends the message
   * @param {Object} priority - Message priority (0 = highest)
   * @returns {Promise} - Promise that resolves when message is sent
   */
  async addMessage(phoneNumber, messageFunction, priority = 5) {
    const queue = this.getQueue(phoneNumber);
    const stats = this.stats.get(phoneNumber);

    stats.totalJobs++;
    stats.lastActivity = new Date();

    logger.debug(`Adicionando mensagem à fila do ${phoneNumber} (prioridade: ${priority})`);

    try {
      const result = await queue.add(
        async () => {
          logger.debug(`Processando mensagem para ${phoneNumber}`);
          const startTime = Date.now();
          
          try {
            const response = await messageFunction();
            const duration = Date.now() - startTime;
            
            stats.completedJobs++;
            
            logger.debug(`Mensagem enviada para ${phoneNumber} em ${duration}ms`);
            
            // Emit success event
            if (global.socketIO) {
              global.socketIO.to(`device-${phoneNumber}`).emit('message-sent', {
                phoneNumber,
                timestamp: new Date().toISOString(),
                duration
              });
            }

            return response;
          } catch (error) {
            stats.failedJobs++;
            logger.error(`Erro ao enviar mensagem para ${phoneNumber}:`, error);
            
            // Emit error event
            if (global.socketIO) {
              global.socketIO.to(`device-${phoneNumber}`).emit('message-failed', {
                phoneNumber,
                error: error.message,
                timestamp: new Date().toISOString()
              });
            }

            throw error;
          }
        },
        { priority }
      );

      return result;
    } catch (error) {
      stats.failedJobs++;
      throw error;
    }
  }

  /**
   * Add bulk messages to the queue
   * @param {string} phoneNumber - Phone number
   * @param {Array} messageFunctions - Array of message functions
   * @param {number} priority - Messages priority
   * @returns {Promise<Array>} - Promise that resolves when all messages are processed
   */
  async addBulkMessages(phoneNumber, messageFunctions, priority = 5) {
    const queue = this.getQueue(phoneNumber);
    
    logger.info(`Adicionando ${messageFunctions.length} mensagens em lote para ${phoneNumber}`);

    const promises = messageFunctions.map(messageFunction => 
      this.addMessage(phoneNumber, messageFunction, priority)
    );

    return Promise.allSettled(promises);
  }

  /**
   * Get queue status for a phone number
   * @param {string} phoneNumber - Phone number
   * @returns {Object} - Queue status
   */
  getQueueStatus(phoneNumber) {
    const queue = this.queues.get(phoneNumber);
    const stats = this.stats.get(phoneNumber);

    if (!queue || !stats) {
      return null;
    }

    return {
      phoneNumber,
      size: queue.size,
      pending: queue.pending,
      isPaused: queue.isPaused,
      stats: {
        ...stats,
        successRate: stats.totalJobs > 0 ? 
          ((stats.completedJobs / stats.totalJobs) * 100).toFixed(2) + '%' : '0%'
      }
    };
  }

  /**
   * Get status of all queues
   * @returns {Array} - Array of queue statuses
   */
  getAllQueuesStatus() {
    return Array.from(this.queues.keys()).map(phoneNumber => 
      this.getQueueStatus(phoneNumber)
    ).filter(status => status !== null);
  }

  /**
   * Pause a queue
   * @param {string} phoneNumber - Phone number
   * @returns {boolean} - Success status
   */
  pauseQueue(phoneNumber) {
    const queue = this.queues.get(phoneNumber);
    if (queue) {
      queue.pause();
      logger.info(`Fila pausada para ${phoneNumber}`);
      return true;
    }
    return false;
  }

  /**
   * Resume a queue
   * @param {string} phoneNumber - Phone number
   * @returns {boolean} - Success status
   */
  resumeQueue(phoneNumber) {
    const queue = this.queues.get(phoneNumber);
    if (queue) {
      queue.start();
      logger.info(`Fila retomada para ${phoneNumber}`);
      return true;
    }
    return false;
  }

  /**
   * Clear a queue
   * @param {string} phoneNumber - Phone number
   * @returns {boolean} - Success status
   */
  clearQueue(phoneNumber) {
    const queue = this.queues.get(phoneNumber);
    if (queue) {
      queue.clear();
      logger.info(`Fila limpa para ${phoneNumber}`);
      return true;
    }
    return false;
  }

  /**
   * Remove a queue
   * @param {string} phoneNumber - Phone number
   * @returns {boolean} - Success status
   */
  removeQueue(phoneNumber) {
    const queue = this.queues.get(phoneNumber);
    if (queue) {
      queue.clear();
      this.queues.delete(phoneNumber);
      this.stats.delete(phoneNumber);
      logger.info(`Fila removida para ${phoneNumber}`);
      return true;
    }
    return false;
  }

  /**
   * Setup event handlers for a queue
   * @param {PQueue} queue - Queue instance
   * @param {string} phoneNumber - Phone number
   */
  setupQueueEvents(queue, phoneNumber) {
    queue.on('add', () => {
      logger.debug(`Job adicionado à fila de ${phoneNumber} (tamanho: ${queue.size})`);
    });

    queue.on('next', () => {
      logger.debug(`Próximo job na fila de ${phoneNumber} (pendentes: ${queue.pending})`);
    });

    queue.on('completed', (result) => {
      logger.debug(`Job concluído na fila de ${phoneNumber}`);
    });

    queue.on('error', (error) => {
      logger.error(`Erro na fila de ${phoneNumber}:`, error);
    });

    queue.on('idle', () => {
      logger.debug(`Fila de ${phoneNumber} está idle`);
      
      // Emit idle event
      if (global.socketIO) {
        global.socketIO.to(`device-${phoneNumber}`).emit('queue-idle', {
          phoneNumber,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  /**
   * Get queue statistics
   * @returns {Object} - Overall statistics
   */
  getOverallStats() {
    const allStats = Array.from(this.stats.values());
    
    return {
      totalQueues: this.queues.size,
      totalJobs: allStats.reduce((sum, stats) => sum + stats.totalJobs, 0),
      completedJobs: allStats.reduce((sum, stats) => sum + stats.completedJobs, 0),
      failedJobs: allStats.reduce((sum, stats) => sum + stats.failedJobs, 0),
      activeQueues: Array.from(this.queues.values()).filter(queue => queue.size > 0 || queue.pending > 0).length,
      pausedQueues: Array.from(this.queues.values()).filter(queue => queue.isPaused).length
    };
  }

  /**
   * Set queue options for a specific phone number
   * @param {string} phoneNumber - Phone number
   * @param {Object} options - Queue options
   */
  setQueueOptions(phoneNumber, options) {
    const queue = this.queues.get(phoneNumber);
    if (queue) {
      // PQueue doesn't support dynamic option changes, so we need to recreate
      logger.warn(`Recriando fila para ${phoneNumber} com novas opções`);
      this.removeQueue(phoneNumber);
      this.getQueue(phoneNumber, options);
    }
  }

  /**
   * Cleanup inactive queues
   * @param {number} maxIdleTime - Maximum idle time in milliseconds
   */
  cleanupInactiveQueues(maxIdleTime = 3600000) { // 1 hour default
    const now = Date.now();
    const phoneNumbers = Array.from(this.stats.keys());

    for (const phoneNumber of phoneNumbers) {
      const stats = this.stats.get(phoneNumber);
      const queue = this.queues.get(phoneNumber);

      if (stats && queue && 
          queue.size === 0 && 
          queue.pending === 0 &&
          (now - stats.lastActivity.getTime()) > maxIdleTime) {
        
        logger.info(`Removendo fila inativa para ${phoneNumber}`);
        this.removeQueue(phoneNumber);
      }
    }
  }

  /**
   * Start periodic cleanup of inactive queues
   * @param {number} interval - Cleanup interval in milliseconds
   */
  startPeriodicCleanup(interval = 1800000) { // 30 minutes default
    setInterval(() => {
      this.cleanupInactiveQueues();
    }, interval);

    logger.info(`Limpeza periódica de filas iniciada (${interval}ms)`);
  }

  /**
   * Get queue by priority
   * @param {string} phoneNumber - Phone number
   * @param {number} priority - Priority level
   * @returns {PQueue} - High priority queue
   */
  getHighPriorityQueue(phoneNumber, priority = 0) {
    const queueKey = `${phoneNumber}-priority-${priority}`;
    
    if (!this.queues.has(queueKey)) {
      const options = {
        ...this.defaultOptions,
        concurrency: 2, // Higher concurrency for priority messages
        interval: 500   // Faster interval
      };
      
      const queue = new PQueue(options);
      this.setupQueueEvents(queue, queueKey);
      this.queues.set(queueKey, queue);
      this.stats.set(queueKey, {
        created: new Date(),
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        lastActivity: new Date()
      });

      logger.debug(`Fila de alta prioridade criada para ${phoneNumber}`);
    }

    return this.queues.get(queueKey);
  }
}

// Export singleton instance
module.exports = new QueueManager();