import { CronJob } from 'cron';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as tar from 'tar';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import logger from '../utils/logger';
import { DATA_DIR, BASE_DIR } from '../utils/paths';
import deviceManager from './newDeviceManager';
import binaryManager from './binaryManager';

interface BackupConfig {
  enabled: boolean;
  schedule: string;
  timezone: string;
  s3Bucket: string;
  s3Region: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Endpoint?: string;
  maxBackups: number;
  compressionLevel: number;
  encryptionKey?: string;
  stopInstancesBeforeBackup: boolean;
}

interface BackupMetadata {
  timestamp: string;
  size: number;
  checksum: string;
  compressed: boolean;
  encrypted: boolean;
  version: string;
}

class BackupManager {
  private config: BackupConfig;
  private s3Client: S3Client;
  private cronJob: CronJob | null = null;
  private isBackupInProgress = false;

  constructor() {
    this.config = this.loadConfig();
    this.s3Client = this.initializeS3Client();
  }

  /**
   * Load backup configuration from environment variables
   */
  private loadConfig(): BackupConfig {
    return {
      enabled: process.env.BACKUP_ENABLED === 'true',
      schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *', // 2 AM daily
      timezone: process.env.BACKUP_TIMEZONE || 'Africa/Nairobi',
      s3Bucket: process.env.BACKUP_S3_BUCKET || '',
      s3Region: process.env.BACKUP_S3_REGION || 'us-east-1',
      s3AccessKey: process.env.BACKUP_S3_ACCESS_KEY || '',
      s3SecretKey: process.env.BACKUP_S3_SECRET_KEY || '',
      s3Endpoint: process.env.BACKUP_S3_ENDPOINT,
      maxBackups: parseInt(process.env.BACKUP_MAX_BACKUPS || '3'),
      compressionLevel: parseInt(process.env.BACKUP_COMPRESSION_LEVEL || '6'),
      encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
      stopInstancesBeforeBackup: process.env.BACKUP_STOP_INSTANCES === 'true'
    };
  }

  /**
   * Initialize S3 client
   */
  private initializeS3Client(): S3Client {
    const clientConfig: any = {
      region: this.config.s3Region,
      credentials: {
        accessKeyId: this.config.s3AccessKey,
        secretAccessKey: this.config.s3SecretKey
      }
    };

    if (this.config.s3Endpoint) {
      clientConfig.endpoint = this.config.s3Endpoint;
      clientConfig.forcePathStyle = true;
    }

    return new S3Client(clientConfig);
  }

  /**
   * Initialize backup manager
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Automatic backup is disabled');
      return;
    }

    try {
      await this.validateConfiguration();
      await this.startScheduledBackups();
      logger.info('Backup Manager initialized successfully');
    } catch (error) {
      logger.error('Error initializing Backup Manager:', error);
      throw error;
    }
  }

  /**
   * Validate backup configuration
   */
  private async validateConfiguration(): Promise<void> {
    if (!this.config.s3Bucket) {
      throw new Error('BACKUP_S3_BUCKET is not set');
    }

    if (!this.config.s3AccessKey || !this.config.s3SecretKey) {
      throw new Error('S3 credentials are not configured');
    }

    // Test S3 connection
    try {
      await this.s3Client.send(new ListObjectsV2Command({
        Bucket: this.config.s3Bucket,
        MaxKeys: 1
      }));
      logger.info('Connection to S3 successfully validated');
    } catch (error) {
      throw new Error(`Failed to connect to S3: ${(error as Error).message}`);
    }
  }

  /**
   * Start scheduled backups
   */
  private async startScheduledBackups(): Promise<void> {
    try {
      this.cronJob = new CronJob(
        this.config.schedule,
        async () => {
          try {
            await this.performBackup();
          } catch (error) {
            logger.error('Error during scheduled backup:', error);
          }
        },
        null,
        true,
        this.config.timezone
      );

      logger.info(`Scheduled automatic backups: ${this.config.schedule}`);
    } catch (error) {
      logger.error('Error scheduling automatic backups:', error);
      throw error;
    }
  }

  /**
   * Perform backup
   */
  async performBackup(): Promise<string> {
    if (this.isBackupInProgress) {
      logger.warn('Backup is already in progress, ignoring new request');
      throw new Error('Backup is already in progress');
    }

    this.isBackupInProgress = true;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `whatsapp-data-backup-${timestamp}.tar.gz`;
    const tempBackupPath = path.join(BASE_DIR, 'temp', backupFileName);

    let stoppedInstances: string[] = [];

    try {
      logger.info('Starting backup of data folder...');

      // Stop instances if configured
      if (this.config.stopInstancesBeforeBackup) {
        logger.info('Stopping instances before backup...');
        stoppedInstances = await this.stopAllInstances();
        logger.info(`${stoppedInstances.length} stopped instances`);
      }

      // Ensure temp directory exists
      await fs.promises.mkdir(path.dirname(tempBackupPath), { recursive: true });

      // Create compressed archive
      await this.createCompressedArchive(tempBackupPath);

      // Encrypt if encryption key is provided
      let finalBackupPath = tempBackupPath;
      if (this.config.encryptionKey) {
        finalBackupPath = await this.encryptFile(tempBackupPath);
        await fs.promises.unlink(tempBackupPath); // Remove unencrypted file
      }

      // Calculate checksum
      const checksum = await this.calculateChecksum(finalBackupPath);

      // Upload to S3
      const s3Key = await this.uploadToS3(finalBackupPath, backupFileName);

      // Create metadata
      const metadata: BackupMetadata = {
        timestamp,
        size: (await fs.promises.stat(finalBackupPath)).size,
        checksum,
        compressed: true,
        encrypted: !!this.config.encryptionKey,
        version: process.env.npm_package_version || '1.0.0'
      };

      // Upload metadata
      await this.uploadMetadata(s3Key, metadata);

      // Clean up temp file
      await fs.promises.unlink(finalBackupPath);

      // Clean up old backups
      await this.cleanupOldBackups();

      logger.info(`Backup completed successfully: ${s3Key}`);
      return s3Key;

    } catch (error) {
      logger.error('Error during backup:', error);
      
      // Clean up temp files on error
      try {
        if (await this.fileExists(tempBackupPath)) {
          await fs.promises.unlink(tempBackupPath);
        }
      } catch (cleanupError) {
        logger.error('Error cleaning temporary files:', cleanupError);
      }

      throw error;
    } finally {
      // Restart instances if they were stopped
      if (this.config.stopInstancesBeforeBackup && stoppedInstances.length > 0) {
        logger.info('Restarting instances after backup...');
        await this.startInstances(stoppedInstances);
        logger.info(`${stoppedInstances.length} restarted instances`);
      }
      
      this.isBackupInProgress = false;
    }
  }

  /**
   * Create compressed archive
   */
  private async createCompressedArchive(outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      tar.create(
        {
          gzip: { level: this.config.compressionLevel },
          file: outputPath,
          cwd: path.dirname(DATA_DIR)
        },
        [path.basename(DATA_DIR)],
        (err: any) => {
          if (err) {
            reject(err);
          } else {
            logger.info(`Compressed file created: ${outputPath}`);
            resolve();
          }
        }
      );
    });
  }

  /**
   * Encrypt file
   */
  private async encryptFile(filePath: string): Promise<string> {
    const encryptedPath = `${filePath}.enc`;
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.config.encryptionKey!, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(algorithm, key);
    const input = fs.createReadStream(filePath);
    const output = fs.createWriteStream(encryptedPath);

    return new Promise((resolve, reject) => {
      // Write IV to the beginning of the file
      output.write(iv);

      input.pipe(cipher).pipe(output);

      output.on('finish', () => {
        logger.info(`Encrypted file: ${encryptedPath}`);
        resolve(encryptedPath);
      });

      output.on('error', reject);
      cipher.on('error', reject);
    });
  }

  /**
   * Calculate file checksum
   */
  private async calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Upload file to S3
   */
  private async uploadToS3(filePath: string, fileName: string): Promise<string> {
    const s3Key = `backups/${fileName}`;
    const fileStream = fs.createReadStream(filePath);

    const command = new PutObjectCommand({
      Bucket: this.config.s3Bucket,
      Key: s3Key,
      Body: fileStream,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'backup-type': 'whatsapp-data',
        'created-at': new Date().toISOString()
      }
    });

    await this.s3Client.send(command);
    logger.info(`Backup sent to S3: s3://${this.config.s3Bucket}/${s3Key}`);

    return s3Key;
  }

  /**
   * Upload metadata to S3
   */
  private async uploadMetadata(backupS3Key: string, metadata: BackupMetadata): Promise<void> {
    const metadataKey = `${backupS3Key}.metadata.json`;

    const command = new PutObjectCommand({
      Bucket: this.config.s3Bucket,
      Key: metadataKey,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: 'application/json'
    });

    await this.s3Client.send(command);
  }

  /**
   * Clean up old backups (keep only maxBackups)
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.s3Bucket,
        Prefix: 'backups/'
      });

      const response = await this.s3Client.send(listCommand);
      
      if (!response.Contents) return;

      // Filter and sort backups by date (newest first)
      const backupFiles = response.Contents
        .filter(obj => obj.Key && !obj.Key.endsWith('.metadata.json'))
        .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0));

      // Keep only maxBackups, delete the rest
      if (backupFiles.length > this.config.maxBackups) {
        const objectsToDelete = backupFiles.slice(this.config.maxBackups);

        for (const obj of objectsToDelete) {
          if (obj.Key) {
            await this.s3Client.send(new DeleteObjectCommand({
              Bucket: this.config.s3Bucket,
              Key: obj.Key
            }));

            // Also delete metadata file
            const metadataKey = `${obj.Key}.metadata.json`;
            try {
              await this.s3Client.send(new DeleteObjectCommand({
                Bucket: this.config.s3Bucket,
                Key: metadataKey
              }));
            } catch (error) {
              // Ignore if metadata file doesn't exist
            }

            logger.info(`Old backup removed: ${obj.Key}`);
          }
        }

        if (objectsToDelete.length > 0) {
          logger.info(`${objectsToDelete.length} old backups removed (keeping newer ${this.config.maxBackups})`);
        }
      }

    } catch (error) {
      logger.error('Error cleaning up old backups:', error);
    }
  }

  /**
   * Stop all instances before backup
   */
  private async stopAllInstances(): Promise<string[]> {
    try {
      const devices = await deviceManager.getAllDevices();
      const stoppedDevices: string[] = [];

      for (const device of devices) {
        if (device.status === 'active' || device.status === 'running') {
          try {
            await binaryManager.stopProcess(device.deviceHash);
            stoppedDevices.push(device.deviceHash);
            logger.info(`Process ${device.deviceHash} stopped for backup`);
          } catch (error) {
            logger.warn(`Error stopping process ${device.deviceHash}:`, error);
          }
        }
      }

      if (stoppedDevices.length > 0) {
        logger.info(`✅ ${stoppedDevices.length} stopped processes for safe backup`);
      } else {
        logger.info('ℹ️ No active processes found to stop');
      }

      return stoppedDevices;
    } catch (error) {
      logger.error('Error stopping processes:', error);
      return [];
    }
  }

  /**
   * Start instances after backup
   */
  private async startInstances(deviceHashes: string[]): Promise<void> {
    try {
      if (deviceHashes.length === 0) {
        logger.info('ℹ️ No process to restart after backup');
        return;
      }

      logger.info(`🔄 Restarting ${deviceHashes.length} processes after backup...`);
      
      // Reload existing processes and sessions after backup
      logger.info('🔄 Reloading existing processes after backup...');
      await binaryManager.loadExistingProcesses();
      logger.info('✅ Existing processes successfully reloaded');

      // Give some time for process loading to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      for (const deviceHash of deviceHashes) {
        try {
          // Check if process was already started by loadExistingProcesses
          const processStatus = await binaryManager.getProcessStatus(deviceHash);
          if (processStatus && processStatus.running) {
            logger.info(`✅ Process ${deviceHash} is already running after reload`);
          } else {
            await binaryManager.startProcess(deviceHash);
            logger.info(`✅ Process ${deviceHash} manually restarted`);
          }
        } catch (error) {
          logger.error(`❌ Error restarting process ${deviceHash}:`, error);
        }
      }

      logger.info(`🎉 Reboot completed for ${deviceHashes.length} processes`);
    } catch (error) {
      logger.error('Error restarting processes:', error);
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<Array<{ key: string; lastModified: Date; size: number; metadata?: BackupMetadata }>> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.config.s3Bucket,
        Prefix: 'backups/',
        Delimiter: '/'
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Contents) return [];

      const backups = [];

      for (const obj of response.Contents) {
        if (obj.Key && !obj.Key.endsWith('.metadata.json')) {
          const backup: any = {
            key: obj.Key,
            lastModified: obj.LastModified!,
            size: obj.Size!
          };

          // Try to load metadata
          try {
            const metadataKey = `${obj.Key}.metadata.json`;
            const metadataResponse = await this.s3Client.send(new GetObjectCommand({
              Bucket: this.config.s3Bucket,
              Key: metadataKey
            }));

            if (metadataResponse.Body) {
              const metadataContent = await metadataResponse.Body.transformToString();
              backup.metadata = JSON.parse(metadataContent);
            }
          } catch (error) {
            // Metadata file doesn't exist or can't be read
          }

          backups.push(backup);
        }
      }

      return backups.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    } catch (error) {
      logger.error('Error listing backups:', error);
      throw error;
    }
  }

  /**
   * Restore backup
   */
  async restoreBackup(backupKey: string): Promise<void> {
    try {
      logger.info(`Starting backup restore: ${backupKey}`);

      const tempRestorePath = path.join(BASE_DIR, 'temp', `restore-${Date.now()}`);
      await fs.promises.mkdir(tempRestorePath, { recursive: true });

      // Download backup from S3
      const downloadPath = await this.downloadFromS3(backupKey, tempRestorePath);

      // Decrypt if needed
      let finalPath = downloadPath;
      if (downloadPath.endsWith('.enc')) {
        if (!this.config.encryptionKey) {
          throw new Error('Encryption key required to restore encrypted backup');
        }
        finalPath = await this.decryptFile(downloadPath);
        await fs.promises.unlink(downloadPath);
      }

      // Backup current data directory
      const currentBackupPath = `${DATA_DIR}.backup-${Date.now()}`;
      if (await this.fileExists(DATA_DIR)) {
        await fs.promises.rename(DATA_DIR, currentBackupPath);
        logger.info(`Current data saved in: ${currentBackupPath}`);
      }

      try {
        // Extract backup
        await this.extractArchive(finalPath);

        // Cleanup temp files
        await fs.promises.unlink(finalPath);
        await fs.promises.rmdir(tempRestorePath);

        // Remove current backup since restore was successful
        if (await this.fileExists(currentBackupPath)) {
          await this.removeDirectory(currentBackupPath);
        }

        logger.info('Restoration completed successfully');

      } catch (error) {
        // Restore original data on failure
        if (await this.fileExists(currentBackupPath)) {
          if (await this.fileExists(DATA_DIR)) {
            await this.removeDirectory(DATA_DIR);
          }
          await fs.promises.rename(currentBackupPath, DATA_DIR);
          logger.info('Original data restored after failure');
        }
        throw error;
      }

    } catch (error) {
      logger.error('Error during restore:', error);
      throw error;
    }
  }

  /**
   * Download backup from S3
   */
  private async downloadFromS3(s3Key: string, downloadDir: string): Promise<string> {
    const fileName = path.basename(s3Key);
    const downloadPath = path.join(downloadDir, fileName);

    const command = new GetObjectCommand({
      Bucket: this.config.s3Bucket,
      Key: s3Key
    });

    const response = await this.s3Client.send(command);
    
    if (!response.Body) {
      throw new Error('Unable to download S3 backup');
    }

    const fileStream = fs.createWriteStream(downloadPath);
    
    return new Promise(async (resolve, reject) => {
      try {
        const stream = response.Body as any;
        stream.pipe(fileStream);
        fileStream.on('finish', () => resolve(downloadPath));
        fileStream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Decrypt file
   */
  private async decryptFile(encryptedPath: string): Promise<string> {
    const decryptedPath = encryptedPath.replace('.enc', '');
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.config.encryptionKey!, 'salt', 32);

    return new Promise((resolve, reject) => {
      const input = fs.createReadStream(encryptedPath);
      const output = fs.createWriteStream(decryptedPath);

      // Read IV from the beginning of the file
      let iv: Buffer;
      let isFirstChunk = true;

      input.on('data', (chunk: string | Buffer) => {
        if (isFirstChunk) {
          const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          iv = bufferChunk.slice(0, 16);
          const decipher = crypto.createDecipher(algorithm, key);
          
          input.pipe(decipher).pipe(output);
          isFirstChunk = false;
        }
      });

      output.on('finish', () => resolve(decryptedPath));
      output.on('error', reject);
    });
  }

  /**
   * Extract archive
   */
  private async extractArchive(archivePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      tar.extract({
        file: archivePath,
        cwd: path.dirname(DATA_DIR)
      })
      .then(() => {
        logger.info(`Extracted file: ${archivePath}`);
        resolve();
      })
      .catch(reject);
    });
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove directory recursively
   */
  private async removeDirectory(dirPath: string): Promise<void> {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  }

  /**
   * Stop scheduled backups
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Automatic backups stopped');
    }
  }

  /**
   * Get backup status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      schedule: this.config.schedule,
      timezone: this.config.timezone,
      lastBackup: null, // Could be tracked in a database
      inProgress: this.isBackupInProgress,
      s3Bucket: this.config.s3Bucket,
      maxBackups: this.config.maxBackups,
      stopInstancesBeforeBackup: this.config.stopInstancesBeforeBackup
    };
  }
}

const backupManager = new BackupManager();
export default backupManager;
