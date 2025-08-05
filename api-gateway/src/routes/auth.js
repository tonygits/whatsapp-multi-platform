const express = require('express');
const { authManager, authorizeRoles } = require('../middleware/auth');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    throw new CustomError(
      'Username e password são obrigatórios',
      400,
      'MISSING_CREDENTIALS'
    );
  }

  logger.info(`Tentativa de login para usuário: ${username}`);

  const user = await authManager.authenticateUser(username, password);
  
  if (!user) {
    logger.warn(`Login falhou para usuário: ${username}`, { ip: req.ip });
    throw new CustomError(
      'Credenciais inválidas',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  const token = authManager.generateToken(user);

  logger.info(`Login bem-sucedido para usuário: ${username}`);

  res.json({
    success: true,
    message: 'Login realizado com sucesso',
    data: {
      token,
      user: {
        username: user.username,
        role: user.role,
        lastLogin: user.lastLogin
      },
      expiresIn: '24h'
    }
  });
}));

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', asyncHandler(async (req, res) => {
  // In a stateless JWT setup, logout is mainly client-side
  // In production, you might want to implement token blacklisting
  
  res.json({
    success: true,
    message: 'Logout realizado com sucesso'
  });
}));

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', require('../middleware/auth').authMiddleware, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      username: req.user.username,
      role: req.user.role,
      iat: req.user.iat,
      exp: req.user.exp
    }
  });
}));

/**
 * POST /api/auth/users
 * Create new user (admin only)
 */
router.post('/users', 
  require('../middleware/auth').authMiddleware,
  authorizeRoles(['admin']),
  asyncHandler(async (req, res) => {
    const { username, password, role = 'user' } = req.body;

    if (!username || !password) {
      throw new CustomError(
        'Username e password são obrigatórios',
        400,
        'MISSING_FIELDS'
      );
    }

    if (username.length < 3) {
      throw new CustomError(
        'Username deve ter pelo menos 3 caracteres',
        400,
        'INVALID_USERNAME'
      );
    }

    if (password.length < 6) {
      throw new CustomError(
        'Password deve ter pelo menos 6 caracteres',
        400,
        'INVALID_PASSWORD'
      );
    }

    if (!['admin', 'user'].includes(role)) {
      throw new CustomError(
        'Role deve ser "admin" ou "user"',
        400,
        'INVALID_ROLE'
      );
    }

    const success = await authManager.addUser(username, password, role);

    if (!success) {
      throw new CustomError(
        'Usuário já existe',
        409,
        'USER_EXISTS'
      );
    }

    logger.info(`Usuário ${username} criado por ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso',
      data: {
        username,
        role
      }
    });
  })
);

/**
 * GET /api/auth/users
 * List all users (admin only)
 */
router.get('/users',
  require('../middleware/auth').authMiddleware,
  authorizeRoles(['admin']),
  asyncHandler(async (req, res) => {
    const users = authManager.listUsers();

    res.json({
      success: true,
      data: {
        users,
        total: users.length
      }
    });
  })
);

/**
 * DELETE /api/auth/users/:username
 * Delete user (admin only)
 */
router.delete('/users/:username',
  require('../middleware/auth').authMiddleware,
  authorizeRoles(['admin']),
  asyncHandler(async (req, res) => {
    const { username } = req.params;

    if (username === req.user.username) {
      throw new CustomError(
        'Não é possível deletar seu próprio usuário',
        400,
        'CANNOT_DELETE_SELF'
      );
    }

    const success = authManager.removeUser(username);

    if (!success) {
      throw new CustomError(
        'Usuário não encontrado ou não pode ser removido',
        404,
        'USER_NOT_FOUND'
      );
    }

    logger.info(`Usuário ${username} removido por ${req.user.username}`);

    res.json({
      success: true,
      message: 'Usuário removido com sucesso'
    });
  })
);

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password',
  require('../middleware/auth').authMiddleware,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new CustomError(
        'Password atual e nova são obrigatórios',
        400,
        'MISSING_PASSWORDS'
      );
    }

    if (newPassword.length < 6) {
      throw new CustomError(
        'Nova password deve ter pelo menos 6 caracteres',
        400,
        'INVALID_NEW_PASSWORD'
      );
    }

    // Verify current password
    const user = await authManager.authenticateUser(req.user.username, currentPassword);
    
    if (!user) {
      throw new CustomError(
        'Password atual incorreta',
        400,
        'INCORRECT_CURRENT_PASSWORD'
      );
    }

    // Remove and re-add user with new password
    authManager.removeUser(req.user.username);
    const success = await authManager.addUser(req.user.username, newPassword, req.user.role);

    if (!success) {
      throw new CustomError(
        'Erro ao alterar password',
        500,
        'PASSWORD_CHANGE_FAILED'
      );
    }

    logger.info(`Password alterada para usuário: ${req.user.username}`);

    res.json({
      success: true,
      message: 'Password alterada com sucesso'
    });
  })
);

/**
 * GET /api/auth/status
 * Check authentication status
 */
router.get('/status', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.json({
      authenticated: false,
      message: 'Nenhum token fornecido'
    });
  }

  const token = authHeader.split(' ')[1];
  const decoded = authManager.verifyToken(token);

  if (!decoded) {
    return res.json({
      authenticated: false,
      message: 'Token inválido ou expirado'
    });
  }

  res.json({
    authenticated: true,
    user: {
      username: decoded.username,
      role: decoded.role
    },
    expiresAt: new Date(decoded.exp * 1000).toISOString()
  });
}));

module.exports = router;