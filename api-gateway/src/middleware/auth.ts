import database from '../database/database';
import logger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

class AuthManager {
  /**
   * Initialize auth manager and default admin user
   */
  async initialize(): Promise<void> {
    try {
      if (!database.isReady()) {
        await database.initialize();
      }
      logger.info('AuthManager inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar AuthManager:', error);
      throw error;
    }
  }

  /**
   * Authenticate user credentials
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object|null>} - User object or null if invalid
   */
  async authenticateUser(username: string, password: string): Promise<any> {
    try {
      if (!username || !password) {
        return null;
      }

      const defaultUser = process.env.DEFAULT_ADMIN_USER || 'admin';
      const defaultPass = process.env.DEFAULT_ADMIN_PASS || 'admin';

      if (username === defaultUser && password === defaultPass) {
        logger.info(`Usuário autenticado: ${username}`);
        return { username, role: 'admin' };
      } else {
        logger.warn(`Falha na autenticação: ${username}`);
        return null;
      }
    } catch (error) {
      logger.error('Erro ao autenticar usuário:', error);
      return null;
    }
  }
}

/**
 * Auth middleware for Express
 */
const authMiddleware = async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
  const API_AUTH_ENABLED = process.env.API_AUTH_ENABLED || 'true'
  if (API_AUTH_ENABLED !== 'true') {
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais de acesso requeridas',
        error: 'MISSING_CREDENTIALS'
      });
    }

    const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
    const [username, password] = credentials.split(':');

    const user = await authManager.authenticateUser(username, password);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas',
        error: 'INVALID_CREDENTIALS'
      });
    }

    // Add user info to request
    req.user = user;

    next();
  } catch (error) {
    logger.error('Erro no middleware de auth:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: 'AUTH_ERROR'
    });
  }
};

// Create singleton instance
const authManager = new AuthManager();

export { authManager, authMiddleware };