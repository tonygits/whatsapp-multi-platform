const database = require('../database/database');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

class UserRepository {
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} - Created user (without password)
   */
  async create(userData) {
    try {
      const { username, password, role = 'user' } = userData;

      // Check if user exists
      const existingUser = await this.findByUsername(username);
      if (existingUser) {
        throw new Error('Usuário já existe');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      const result = await database.run(
        `INSERT INTO users (username, password_hash, role)
         VALUES (?, ?, ?)`,
        [username, passwordHash, role]
      );

      const user = await this.findById(result.lastID);
      logger.info(`Usuário criado: ${username}`, { userId: result.lastID, role });
      
      // Return user without password
      const { password_hash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      logger.error('Erro ao criar usuário:', error);
      throw error;
    }
  }

  /**
   * Find user by ID
   * @param {number} id - User ID
   * @returns {Promise<Object|null>} - User or null
   */
  async findById(id) {
    try {
      const user = await database.get(
        'SELECT * FROM users WHERE id = ? AND active = 1',
        [id]
      );
      return user;
    } catch (error) {
      logger.error('Erro ao buscar usuário por ID:', error);
      throw error;
    }
  }

  /**
   * Find user by username
   * @param {string} username - Username
   * @returns {Promise<Object|null>} - User or null
   */
  async findByUsername(username) {
    try {
      const user = await database.get(
        'SELECT * FROM users WHERE username = ? AND active = 1',
        [username]
      );
      return user;
    } catch (error) {
      logger.error('Erro ao buscar usuário por username:', error);
      throw error;
    }
  }

  /**
   * Get all users
   * @returns {Promise<Array>} - Array of users (without passwords)
   */
  async findAll() {
    try {
      const users = await database.all(
        'SELECT id, username, role, created_at, last_login, active FROM users WHERE active = 1 ORDER BY created_at DESC'
      );
      return users;
    } catch (error) {
      logger.error('Erro ao listar usuários:', error);
      throw error;
    }
  }

  /**
   * Authenticate user
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object|null>} - User (without password) or null
   */
  async authenticate(username, password) {
    try {
      const user = await this.findByUsername(username);
      if (!user) {
        return null;
      }

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return null;
      }

      // Update last login
      await this.updateLastLogin(user.id);

      // Return user without password
      const { password_hash, ...userWithoutPassword } = user;
      return {
        ...userWithoutPassword,
        last_login: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Erro ao autenticar usuário:', error);
      throw error;
    }
  }

  /**
   * Update user password
   * @param {number} id - User ID
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} - Success status
   */
  async updatePassword(id, newPassword) {
    try {
      const passwordHash = await bcrypt.hash(newPassword, 12);
      
      const result = await database.run(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [passwordHash, id]
      );

      const success = result.changes > 0;
      if (success) {
        logger.info(`Senha atualizada para usuário ID: ${id}`);
      }
      
      return success;
    } catch (error) {
      logger.error('Erro ao atualizar senha:', error);
      throw error;
    }
  }

  /**
   * Update user role
   * @param {number} id - User ID
   * @param {string} role - New role
   * @returns {Promise<boolean>} - Success status
   */
  async updateRole(id, role) {
    try {
      const result = await database.run(
        'UPDATE users SET role = ? WHERE id = ?',
        [role, id]
      );

      const success = result.changes > 0;
      if (success) {
        logger.info(`Role atualizada para usuário ID: ${id}`);
      }
      
      return success;
    } catch (error) {
      logger.error('Erro ao atualizar role:', error);
      throw error;
    }
  }

  /**
   * Update last login timestamp
   * @param {number} id - User ID
   * @returns {Promise<boolean>} - Success status
   */
  async updateLastLogin(id) {
    try {
      const result = await database.run(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );

      return result.changes > 0;
    } catch (error) {
      logger.error('Erro ao atualizar last login:', error);
      throw error;
    }
  }

  /**
   * Deactivate user (soft delete)
   * @param {number} id - User ID
   * @returns {Promise<boolean>} - Success status
   */
  async deactivate(id) {
    try {
      // Don't allow deactivating admin user with username 'admin'
      const user = await this.findById(id);
      if (user && user.username === 'admin' && user.role === 'admin') {
        throw new Error('Não é possível desativar o usuário admin padrão');
      }

      const result = await database.run(
        'UPDATE users SET active = 0 WHERE id = ?',
        [id]
      );

      const success = result.changes > 0;
      if (success) {
        logger.info(`Usuário desativado: ID ${id}`);
      }
      
      return success;
    } catch (error) {
      logger.error('Erro ao desativar usuário:', error);
      throw error;
    }
  }

  /**
   * Initialize default admin user
   * @returns {Promise<Object|null>} - Admin user or null
   */
  async initializeDefaultAdmin() {
    try {
      const defaultUser = process.env.DEFAULT_ADMIN_USER || 'admin';
      const defaultPass = process.env.DEFAULT_ADMIN_PASS || 'admin123';

      // Check if admin already exists
      let adminUser = await this.findByUsername(defaultUser);
      
      if (!adminUser) {
        // Create default admin
        const passwordHash = await bcrypt.hash(defaultPass, 12);
        
        const result = await database.run(
          `INSERT INTO users (username, password_hash, role)
           VALUES (?, ?, ?)`,
          [defaultUser, passwordHash, 'admin']
        );

        adminUser = await this.findById(result.lastID);
        logger.info(`Usuário admin padrão criado: ${defaultUser}`);
      } else {
        // Update password if needed (in case env changed)
        const isCurrentPassword = await bcrypt.compare(defaultPass, adminUser.password_hash);
        if (!isCurrentPassword) {
          await this.updatePassword(adminUser.id, defaultPass);
          adminUser = await this.findById(adminUser.id);
          logger.info(`Senha do admin padrão atualizada: ${defaultUser}`);
        } else {
          logger.info(`Usuário admin padrão já existe: ${defaultUser}`);
        }
      }

      // Return without password
      const { password_hash, ...userWithoutPassword } = adminUser;
      return userWithoutPassword;
    } catch (error) {
      logger.error('Erro ao inicializar usuário admin padrão:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   * @returns {Promise<Object>} - User statistics
   */
  async getStatistics() {
    try {
      const stats = await database.get(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
          SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as users,
          SUM(CASE WHEN last_login > datetime('now', '-7 days') THEN 1 ELSE 0 END) as active_week
        FROM users
        WHERE active = 1
      `);

      return stats;
    } catch (error) {
      logger.error('Erro ao obter estatísticas de usuários:', error);
      throw error;
    }
  }
}

module.exports = new UserRepository();