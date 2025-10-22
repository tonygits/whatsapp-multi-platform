import database from '../database/database';
import logger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';
import {verifyJwt} from "../utils/jwt";
import userRepository from "../repositories/UserRepository";

class AuthManager {
  /**
   * Initialize auth manager and default admin user
   */
  async initialize(): Promise<void> {
    try {
      if (!database.isReady()) {
        await database.initialize();
      }
      logger.info('AuthManager initialized successfully');
    } catch (error) {
      logger.error('Error initializing AuthManager:', error);
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
        logger.info(`Authenticated user: ${username}`);
        return { username, role: 'admin' };
      } else {
        logger.warn(`Authentication failed: ${username}`);
        return null;
      }
    } catch (error) {
      logger.error('Error authenticating user:', error);
      return null;
    }
  }

    async generateUserSession(id: string, email: string): Promise<any> {
        try {
            if (!id) {
                return null;
            }

            const user = await userRepository.findById(id)

            if (email === user.email) {
                logger.info(`Authenticated user: ${email}`);
                return { user, role: 'admin' };
            } else {
                logger.warn(`Authentication failed: ${email}`);
                return null;
            }
        } catch (error) {
            logger.error('Error authenticating user:', error);
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
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Required access credentials',
        error: 'MISSING_CREDENTIALS'
      });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

    const {sub, iss} = verifyJwt(parts[1])
    const user = await authManager.generateUserSession(sub, iss as string);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        error: 'INVALID_CREDENTIALS'
      });
    }

    // Add user info to request
    req.user = user;

    next();
  } catch (error) {
    logger.error('Error in auth middleware:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
      error: 'AUTH_ERROR'
    });
  }
};

// Create singleton instance
const authManager = new AuthManager();

export { authManager, authMiddleware };
