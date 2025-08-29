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
      timezone: process.env.BACKUP_TIMEZONE || 'America/Sao_Paulo',
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
      logger.info('Backup automático está desabilitado');
      return;
    }

    try {
      await this.validateConfiguration();
      await this.startScheduledBackups();
      logger.info('Backup Manager inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar Backup Manager:', error);
      throw error;
    }
  }

  /**
   * Validate backup configuration
   */
  private async validateConfiguration(): Promise<void> {
    if (!this.config.s3Bucket) {
      throw new Error('BACKUP_S3_BUCKET não está configurado');
    }

    if (!this.config.s3AccessKey || !this.config.s3SecretKey) {
      throw new Error('Credenciais S3 não estão configuradas');
    }

    // Test S3 connection
    try {
      await this.s3Client.send(new ListObjectsV2Command({
        Bucket: this.config.s3Bucket,
        MaxKeys: 1
      }));
      logger.info('Conexão com S3 validada com sucesso');
    } catch (error) {
      throw new Error(`Falha ao conectar com S3: ${(error as Error).message}`);
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
            logger.error('Erro durante backup agendado:', error);
          }
        },
        null,
        true,
        this.config.timezone
      );

      logger.info(`Backups automáticos agendados: ${this.config.schedule}`);
    } catch (error) {
      logger.error('Erro ao agendar backups automáticos:', error);
      throw error;
    }
  }

  /**
   * Perform backup
   */
  async performBackup(): Promise<string> {
    if (this.isBackupInProgress) {
      logger.warn('Backup já está em progresso, ignorando nova solicitação');
      throw new Error('Backup já está em progresso');
    }

    this.isBackupInProgress = true;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `whatsapp-data-backup-${timestamp}.tar.gz`;
    const tempBackupPath = path.join(BASE_DIR, 'temp', backupFileName);

    let stoppedInstances: string[] = [];

    try {
      logger.info('Iniciando backup da pasta data...');

      // Stop instances if configured
      if (this.config.stopInstancesBeforeBackup) {
        logger.info('Parando instâncias antes do backup...');
        stoppedInstances = await this.stopAllInstances();
        logger.info(`${stoppedInstances.length} instâncias paradas`);
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

      logger.info(`Backup concluído com sucesso: ${s3Key}`);
      return s3Key;

    } catch (error) {
      logger.error('Erro durante o backup:', error);
      
      // Clean up temp files on error
      try {
        if (await this.fileExists(tempBackupPath)) {
          await fs.promises.unlink(tempBackupPath);
        }
      } catch (cleanupError) {
        logger.error('Erro ao limpar arquivos temporários:', cleanupError);
      }

      throw error;
    } finally {
      // Restart instances if they were stopped
      if (this.config.stopInstancesBeforeBackup && stoppedInstances.length > 0) {
        logger.info('Reiniciando instâncias após backup...');
        await this.startInstances(stoppedInstances);
        logger.info(`${stoppedInstances.length} instâncias reiniciadas`);
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
            logger.info(`Arquivo comprimido criado: ${outputPath}`);
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
        logger.info(`Arquivo criptografado: ${encryptedPath}`);
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
    logger.info(`Backup enviado para S3: s3://${this.config.s3Bucket}/${s3Key}`);

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

            logger.info(`Backup antigo removido: ${obj.Key}`);
          }
        }

        if (objectsToDelete.length > 0) {
          logger.info(`${objectsToDelete.length} backups antigos removidos (mantendo ${this.config.maxBackups} mais recentes)`);
        }
      }

    } catch (error) {
      logger.error('Erro ao limpar backups antigos:', error);
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
            logger.info(`Processo ${device.deviceHash} parado para backup`);
          } catch (error) {
            logger.warn(`Erro ao parar processo ${device.deviceHash}:`, error);
          }
        }
      }

      if (stoppedDevices.length > 0) {
        logger.info(`✅ ${stoppedDevices.length} processos parados para backup seguro`);
      } else {
        logger.info('ℹ️ Nenhum processo ativo encontrado para parar');
      }

      return stoppedDevices;
    } catch (error) {
      logger.error('Erro ao parar processos:', error);
      return [];
    }
  }

  /**
   * Start instances after backup
   */
  private async startInstances(deviceHashes: string[]): Promise<void> {
    try {
      if (deviceHashes.length === 0) {
        logger.info('ℹ️ Nenhum processo para reiniciar após backup');
        return;
      }

      logger.info(`🔄 Reiniciando ${deviceHashes.length} processos após backup...`);
      
      // Reload existing processes and sessions after backup
      logger.info('🔄 Recarregando processos existentes após backup...');
      await binaryManager.loadExistingProcesses();
      logger.info('✅ Processos existentes recarregados com sucesso');

      // Give some time for process loading to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      for (const deviceHash of deviceHashes) {
        try {
          // Check if process was already started by loadExistingProcesses
          const processStatus = await binaryManager.getProcessStatus(deviceHash);
          if (processStatus && processStatus.running) {
            logger.info(`✅ Processo ${deviceHash} já está rodando após recarregamento`);
          } else {
            await binaryManager.startProcess(deviceHash);
            logger.info(`✅ Processo ${deviceHash} reiniciado manualmente`);
          }
        } catch (error) {
          logger.error(`❌ Erro ao reiniciar processo ${deviceHash}:`, error);
        }
      }

      logger.info(`🎉 Reinicialização concluída para ${deviceHashes.length} processos`);
    } catch (error) {
      logger.error('Erro ao reiniciar processos:', error);
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
      logger.error('Erro ao listar backups:', error);
      throw error;
    }
  }

  /**
   * Restore backup
   */
  async restoreBackup(backupKey: string): Promise<void> {
    try {
      logger.info(`Iniciando restauração do backup: ${backupKey}`);

      const tempRestorePath = path.join(BASE_DIR, 'temp', `restore-${Date.now()}`);
      await fs.promises.mkdir(tempRestorePath, { recursive: true });

      // Download backup from S3
      const downloadPath = await this.downloadFromS3(backupKey, tempRestorePath);

      // Decrypt if needed
      let finalPath = downloadPath;
      if (downloadPath.endsWith('.enc')) {
        if (!this.config.encryptionKey) {
          throw new Error('Chave de criptografia necessária para restaurar backup criptografado');
        }
        finalPath = await this.decryptFile(downloadPath);
        await fs.promises.unlink(downloadPath);
      }

      // Backup current data directory
      const currentBackupPath = `${DATA_DIR}.backup-${Date.now()}`;
      if (await this.fileExists(DATA_DIR)) {
        await fs.promises.rename(DATA_DIR, currentBackupPath);
        logger.info(`Dados atuais salvos em: ${currentBackupPath}`);
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

        logger.info('Restauração concluída com sucesso');

      } catch (error) {
        // Restore original data on failure
        if (await this.fileExists(currentBackupPath)) {
          if (await this.fileExists(DATA_DIR)) {
            await this.removeDirectory(DATA_DIR);
          }
          await fs.promises.rename(currentBackupPath, DATA_DIR);
          logger.info('Dados originais restaurados após falha');
        }
        throw error;
      }

    } catch (error) {
      logger.error('Erro durante a restauração:', error);
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
      throw new Error('Não foi possível baixar o backup do S3');
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
        logger.info(`Arquivo extraído: ${archivePath}`);
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
      logger.info('Backups automáticos interrompidos');
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
