const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

class AuthManager {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    this.users = new Map(); // In production, use a database
    this.initializeDefaultUser();
  }

  /**
   * Initialize default admin user
   */
  async initializeDefaultUser() {
    const defaultUser = process.env.DEFAULT_ADMIN_USER || 'admin';
    const defaultPass = process.env.DEFAULT_ADMIN_PASS || 'admin123';
    
    try {
      const hashedPassword = await bcrypt.hash(defaultPass, 12);
      this.users.set(defaultUser, {
        username: defaultUser,
        password: hashedPassword,
        role: 'admin',
        createdAt: new Date(),
        lastLogin: null
      });

      logger.info(`Usuário admin padrão inicializado: ${defaultUser}`);
    } catch (error) {
      logger.error('Erro ao inicializar usuário padrão:', error);
    }
  }

  /**
   * Authenticate user credentials
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object|null>} - User object or null if invalid
   */
  async authenticateUser(username, password) {
    const user = this.users.get(username);
    if (!user) {
      return null;
    }

    try {
      const isValid = await bcrypt.compare(password, user.password);
      if (isValid) {
        // Update last login
        user.lastLogin = new Date();
        return {
          username: user.username,
          role: user.role,
          lastLogin: user.lastLogin
        };
      }
      return null;
    } catch (error) {
      logger.error('Erro na autenticação:', error);
      return null;
    }
  }

  /**
   * Generate JWT token
   * @param {Object} user - User object
   * @returns {string} - JWT token
   */
  generateToken(user) {
    return jwt.sign(
      {
        username: user.username,
        role: user.role,
        iat: Math.floor(Date.now() / 1000)
      },
      this.jwtSecret,
      {
        expiresIn: '24h',
        issuer: 'whatsapp-gateway',
        audience: 'whatsapp-api'
      }
    );
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object|null} - Decoded token or null if invalid
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'whatsapp-gateway',
        audience: 'whatsapp-api'
      });
    } catch (error) {
      logger.debug('Token inválido:', error.message);
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
    if (this.users.has(username)) {
      return false;
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      this.users.set(username, {
        username,
        password: hashedPassword,
        role,
        createdAt: new Date(),
        lastLogin: null
      });

      logger.info(`Usuário ${username} criado com sucesso`);
      return true;
    } catch (error) {
      logger.error('Erro ao criar usuário:', error);
      return false;
    }
  }

  /**
   * Remove user
   * @param {string} username - Username
   * @returns {boolean} - Success status
   */
  removeUser(username) {
    if (username === process.env.DEFAULT_ADMIN_USER) {
      logger.warn('Tentativa de remover usuário admin padrão bloqueada');
      return false;
    }

    const removed = this.users.delete(username);
    if (removed) {
      logger.info(`Usuário ${username} removido`);
    }
    return removed;
  }

  /**
   * List all users (without passwords)
   * @returns {Array} - Array of user objects
   */
  listUsers() {
    return Array.from(this.users.values()).map(user => ({
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }));
  }
}

// Create auth manager instance
const authManager = new AuthManager();

/**
 * Authentication middleware
 */
const authMiddleware = (req, res, next) => {
  // Skip auth for health check endpoints
  if (req.path.startsWith('/api/health')) {
    return next();
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      error: 'Token de acesso necessário',
      code: 'MISSING_TOKEN'
    });
  }

  const token = authHeader.split(' ')[1]; // Bearer <token>
  
  if (!token) {
    return res.status(401).json({
      error: 'Formato de token inválido',
      code: 'INVALID_TOKEN_FORMAT'
    });
  }

  const decoded = authManager.verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({
      error: 'Token inválido ou expirado',
      code: 'INVALID_TOKEN'
    });
  }

  // Add user info to request
  req.user = decoded;
  
  logger.debug(`Usuário autenticado: ${decoded.username} (${decoded.role})`);
  next();
};

/**
 * Role-based authorization middleware
 * @param {Array} allowedRoles - Array of allowed roles
 */
const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Usuário não autenticado',
        code: 'NOT_AUTHENTICATED'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Acesso negado para ${req.user.username} - role: ${req.user.role}`);
      return res.status(403).json({
        error: 'Acesso negado - permissões insuficientes',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredRoles: allowedRoles,
        userRole: req.user.role
      });
    }

    next();
  };
};

/**
 * API Key middleware (alternative auth method)
 */
const apiKeyMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    // If no API key is configured, skip this middleware
    return next();
  }

  if (!apiKey) {
    return res.status(401).json({
      error: 'API Key necessária',
      code: 'MISSING_API_KEY'
    });
  }

  if (apiKey !== validApiKey) {
    return res.status(401).json({
      error: 'API Key inválida',
      code: 'INVALID_API_KEY'
    });
  }

  // Add API key auth info
  req.apiKeyAuth = true;
  next();
};

/**
 * Combined auth middleware (JWT or API Key)
 */
const flexibleAuthMiddleware = (req, res, next) => {
  // Skip auth for health check endpoints
  if (req.path.startsWith('/api/health')) {
    return next();
  }

  // Try API Key first
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;

  if (validApiKey && apiKey === validApiKey) {
    req.apiKeyAuth = true;
    return next();
  }

  // Fallback to JWT
  return authMiddleware(req, res, next);
};

module.exports = {
  authManager,
  authMiddleware,
  authorizeRoles,
  apiKeyMiddleware,
  flexibleAuthMiddleware
};