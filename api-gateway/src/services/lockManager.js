const lockfile = require('proper-lockfile');
const path = require('path');
const logger = require('../utils/logger');

class LockManager {
  constructor() {
    this.locks = new Map();
    this.lockOptions = {
      stale: 10000, // 10 seconds
      retries: {
        retries: 5,
        factor: 2,
        minTimeout: 100,
        maxTimeout: 1000,
        randomize: true
      }
    };
  }

  /**
   * Acquire a lock for a file
   * @param {string} filePath - Path to the file to lock
   * @param {string} lockId - Unique identifier for this lock operation
   * @returns {Promise<boolean>} - Success status
   */
  async acquireLock(filePath, lockId = 'default') {
    const fullPath = path.resolve(filePath);
    const lockKey = `${fullPath}:${lockId}`;

    try {
      logger.debug(`Tentando adquirir lock para: ${lockKey}`);
      
      const release = await lockfile.lock(fullPath, this.lockOptions);
      this.locks.set(lockKey, {
        release,
        filePath: fullPath,
        lockId,
        acquiredAt: new Date()
      });

      logger.debug(`Lock adquirido com sucesso: ${lockKey}`);
      return true;
    } catch (error) {
      logger.error(`Erro ao adquirir lock ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Release a lock for a file
   * @param {string} filePath - Path to the file to unlock
   * @param {string} lockId - Unique identifier for this lock operation
   * @returns {Promise<boolean>} - Success status
   */
  async releaseLock(filePath, lockId = 'default') {
    const fullPath = path.resolve(filePath);
    const lockKey = `${fullPath}:${lockId}`;

    try {
      const lockInfo = this.locks.get(lockKey);
      if (!lockInfo) {
        logger.warn(`Tentativa de liberar lock inexistente: ${lockKey}`);
        return false;
      }

      await lockInfo.release();
      this.locks.delete(lockKey);

      logger.debug(`Lock liberado com sucesso: ${lockKey}`);
      return true;
    } catch (error) {
      logger.error(`Erro ao liberar lock ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Execute a function with file lock protection
   * @param {string} filePath - Path to the file to lock
   * @param {Function} fn - Function to execute while holding the lock
   * @param {string} lockId - Unique identifier for this lock operation
   * @returns {Promise<any>} - Result of the function execution
   */
  async withLock(filePath, fn, lockId = 'default') {
    const lockAcquired = await this.acquireLock(filePath, lockId);
    
    if (!lockAcquired) {
      throw new Error(`Não foi possível adquirir lock para ${filePath}`);
    }

    try {
      const result = await fn();
      return result;
    } finally {
      await this.releaseLock(filePath, lockId);
    }
  }

  /**
   * Check if a file is currently locked
   * @param {string} filePath - Path to the file to check
   * @param {string} lockId - Unique identifier for this lock operation
   * @returns {boolean} - Lock status
   */
  isLocked(filePath, lockId = 'default') {
    const fullPath = path.resolve(filePath);
    const lockKey = `${fullPath}:${lockId}`;
    return this.locks.has(lockKey);
  }

  /**
   * Get information about all active locks
   * @returns {Array} - Array of lock information objects
   */
  getActiveLocks() {
    return Array.from(this.locks.entries()).map(([key, info]) => ({
      lockKey: key,
      filePath: info.filePath,
      lockId: info.lockId,
      acquiredAt: info.acquiredAt,
      duration: Date.now() - info.acquiredAt.getTime()
    }));
  }

  /**
   * Release all locks (cleanup)
   */
  async releaseAllLocks() {
    logger.info(`Liberando ${this.locks.size} locks ativos...`);
    
    const promises = Array.from(this.locks.entries()).map(async ([key, info]) => {
      try {
        await info.release();
        logger.debug(`Lock liberado durante cleanup: ${key}`);
      } catch (error) {
        logger.error(`Erro ao liberar lock durante cleanup ${key}:`, error);
      }
    });

    await Promise.allSettled(promises);
    this.locks.clear();
    logger.info('Cleanup de locks concluído');
  }
}

// Export singleton instance
module.exports = new LockManager();