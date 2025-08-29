import { Router, Request, Response } from 'express';
import backupManager from '../services/backupManager';
import logger from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /api/backup/status:
 *   get:
 *     summary: Get backup status
 *     tags: [Backup]
 *     responses:
 *       200:
 *         description: Backup status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                 schedule:
 *                   type: string
 *                 lastBackup:
 *                   type: string
 *                   nullable: true
 *                 inProgress:
 *                   type: boolean
 *                 s3Bucket:
 *                   type: string
 *                 retentionDays:
 *                   type: number
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = backupManager.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Erro ao obter status do backup:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: (error as Error).message 
    });
  }
});

/**
 * @swagger
 * /api/backup/trigger:
 *   post:
 *     summary: Trigger manual backup
 *     tags: [Backup]
 *     responses:
 *       200:
 *         description: Backup started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 backupKey:
 *                   type: string
 *       400:
 *         description: Backup already in progress
 *       500:
 *         description: Internal server error
 */
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const backupKey = await backupManager.performBackup();
    res.json({ 
      message: 'Backup realizado com sucesso',
      backupKey 
    });
  } catch (error) {
    logger.error('Erro ao realizar backup manual:', error);
    
    if ((error as Error).message.includes('já está em progresso')) {
      res.status(400).json({ 
        error: 'Backup já está em progresso',
        message: (error as Error).message 
      });
    } else {
      res.status(500).json({ 
        error: 'Erro ao realizar backup',
        message: (error as Error).message 
      });
    }
  }
});

/**
 * @swagger
 * /api/backup/list:
 *   get:
 *     summary: List available backups
 *     tags: [Backup]
 *     responses:
 *       200:
 *         description: List of available backups
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 backups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:
 *                         type: string
 *                       lastModified:
 *                         type: string
 *                         format: date-time
 *                       size:
 *                         type: number
 *                       metadata:
 *                         type: object
 *                         nullable: true
 *       500:
 *         description: Internal server error
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const backups = await backupManager.listBackups();
    res.json({ backups });
  } catch (error) {
    logger.error('Erro ao listar backups:', error);
    res.status(500).json({ 
      error: 'Erro ao listar backups',
      message: (error as Error).message 
    });
  }
});

/**
 * @swagger
 * /api/backup/restore:
 *   post:
 *     summary: Restore backup
 *     tags: [Backup]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - backupKey
 *             properties:
 *               backupKey:
 *                 type: string
 *                 description: S3 key of the backup to restore
 *     responses:
 *       200:
 *         description: Backup restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Internal server error
 */
router.post('/restore', async (req: Request, res: Response) => {
  try {
    const { backupKey } = req.body;

    if (!backupKey || typeof backupKey !== 'string') {
      return res.status(400).json({ 
        error: 'backupKey é obrigatório e deve ser uma string' 
      });
    }

    await backupManager.restoreBackup(backupKey);
    res.json({ 
      message: 'Backup restaurado com sucesso',
      backupKey 
    });
  } catch (error) {
    logger.error('Erro ao restaurar backup:', error);
    res.status(500).json({ 
      error: 'Erro ao restaurar backup',
      message: (error as Error).message 
    });
  }
});

export default router;
