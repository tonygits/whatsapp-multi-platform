const jwt = require('jsonwebtoken');
const database = require('../database/database');
const userRepository = require('../repositories/UserRepository');
const logger = require('../utils/logger');

class AuthManager {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
  }

  /**
   * Initialize auth manager and default admin user
   */
  async initialize() {
    try {
      // Initialize database if not already done
      if (!database.isReady()) {
        await database.initialize();
      }

      // Initialize default admin user
      await userRepository.initializeDefaultAdmin();
      
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
  async authenticateUser(username, password) {
    try {
      if (!username || !password) {
        return null;
      }

      const user = await userRepository.authenticate(username, password);
      
      if (user) {
        logger.info(`Usuário autenticado: ${username}`);
      } else {
        logger.warn(`Falha na autenticação: ${username}`);
      }

      return user;
    } catch (error) {
      logger.error('Erro ao autenticar usuário:', error);
      return null;
    }
  }

  /**
   * Generate JWT token for user
   * @param {Object} user - User object
   * @returns {string} - JWT token
   */
  generateToken(user) {
    try {
      const payload = {
        id: user.id,
        username: user.username,
        role: user.role
      };

      const token = jwt.sign(payload, this.jwtSecret, {
        expiresIn: this.jwtExpiresIn,
        issuer: 'whatsapp-gateway',
        subject: user.id.toString()
      });

      return token;
    } catch (error) {
      logger.error('Erro ao gerar token:', error);
      throw error;
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object|null} - Decoded token or null if invalid
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.warn('Token expirado');
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn('Token inválido');
      } else {
        logger.error('Erro ao verificar token:', error);
      }
      return null;
    }
  }

  /**
   * Add new user
   * @param {string} username - Username
   * @param {string} password - Password
   * @param {string} role - User role
   * @returns {Promise<boolean>} - Success status
   */
  async addUser(username, password, role = 'user') {
    try {
      await userRepository.create({ username, password, role });
      return true;
    } catch (error) {
      if (error.message === 'Usuário já existe') {
        return false;
      }
      logger.error('Erro ao adicionar usuário:', error);
      throw error;
    }
  }

  /**
   * Remove user
   * @param {string} username - Username
   * @returns {Promise<boolean>} - Success status
   */
  async removeUser(username) {
    try {
      const user = await userRepository.findByUsername(username);
      if (!user) {
        return false;
      }

      // Prevent removing default admin
      if (user.username === 'admin' && user.role === 'admin') {
        logger.warn('Tentativa de remover usuário admin padrão bloqueada');
        return false;
      }

      const success = await userRepository.deactivate(user.id);
      return success;
    } catch (error) {
      logger.error('Erro ao remover usuário:', error);
      throw error;
    }
  }

  /**
   * List all users
   * @returns {Promise<Array>} - Array of users (without passwords)
   */
  async listUsers() {
    try {
      const users = await userRepository.findAll();
      return users.map(user => ({
        username: user.username,
        role: user.role,
        createdAt: user.created_at,
        lastLogin: user.last_login
      }));
    } catch (error) {
      logger.error('Erro ao listar usuários:', error);
      throw error;
    }
  }

  /**
   * Update user password
   * @param {string} username - Username
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} - Success status
   */
  async updateUserPassword(username, newPassword) {
    try {
      const user = await userRepository.findByUsername(username);
      if (!user) {
        return false;
      }

      const success = await userRepository.updatePassword(user.id, newPassword);
      return success;
    } catch (error) {
      logger.error('Erro ao atualizar senha:', error);
      throw error;
    }
  }

  /**
   * Get user by username
   * @param {string} username - Username
   * @returns {Promise<Object|null>} - User (without password) or null
   */
  async getUser(username) {
    try {
      const user = await userRepository.findByUsername(username);
      if (!user) {
        return null;
      }

      const { password_hash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      logger.error('Erro ao buscar usuário:', error);
      throw error;
    }
  }
}

/**
 * Auth middleware for Express
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token de acesso requerido',
        error: 'MISSING_TOKEN'
      });
    }

    const token = authHeader.substring(7);
    const decoded = authManager.verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido ou expirado',
        error: 'INVALID_TOKEN'
      });
    }

    // Add user info to request
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };

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

/**
 * Role authorization middleware
 * @param {Array} allowedRoles - Array of allowed roles
 * @returns {Function} - Express middleware
 */
const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado',
        error: 'NOT_AUTHENTICATED'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado: permissões insuficientes',
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

// Create singleton instance
const authManager = new AuthManager();

module.exports = {
  AuthManager,
  authManager,
  authMiddleware,
  authorizeRoles
};