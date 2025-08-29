import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger';
import { VOLUMES_DIR } from '../utils/paths';

class Database {
  db: any;
  dbPath: string;
  isConnected: boolean;
  initialized: boolean;

  constructor() {
    this.db = null;
    this.dbPath = path.join(VOLUMES_DIR, 'whatsapp.db');
    this.isConnected = false;
    this.initialized = false;
  }

  /**
   * Initialize database connection and schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info('Banco de dados já foi inicializado');
      return;
    }

    try {
      logger.info('Inicializando banco de dados SQLite...');
      
      // Ensure volumes directory exists
      const dbDir = path.dirname(this.dbPath);
      await fs.mkdir(dbDir, { recursive: true });

      // Create database connection
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Erro ao conectar ao banco de dados:', err);
          throw err;
        }
      });

      // Enable foreign keys and WAL mode for better performance
      await this.run('PRAGMA foreign_keys = ON');
      await this.run('PRAGMA journal_mode = WAL');
      await this.run('PRAGMA synchronous = NORMAL');
      await this.run('PRAGMA cache_size = 1000');
      await this.run('PRAGMA temp_store = MEMORY');

      // Initialize schema
      await this.initializeSchema();
      
      this.isConnected = true;
      this.initialized = true;
      logger.info('Banco de dados SQLite inicializado com sucesso');
      
    } catch (error) {
      logger.error('Erro ao inicializar banco de dados:', error);
      throw error;
    }
  }

  /**
   * Initialize database schema
   */
  async initializeSchema(): Promise<void> {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf8');
      
      // Remove comments and split by lines
      const lines = schema.split('\n');
      let currentStatement = '';
      const statements = [];
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('--')) {
          continue;
        }
        
        currentStatement += line + '\n';
        
        // Check if statement is complete
        if (trimmedLine.endsWith(';') || trimmedLine === 'END') {
          statements.push(currentStatement.trim());
          currentStatement = '';
        }
      }
      
      // Execute each statement
      for (const statement of statements) {
        if (statement) {
          await this.run(statement);
        }
      }
      
      logger.info('Schema do banco de dados aplicado com sucesso');
    } catch (error) {
      logger.error('Erro ao aplicar schema:', error);
      throw error;
    }
  }

  /**
   * Run a SQL query that doesn't return rows
   * @param {string} sql - SQL statement
   * @param {Array} params - Parameters for the query
   * @returns {Promise<Object>} - Result with lastID and changes
   */
  run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database não inicializado'));
      }
      this.db.run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          logger.error('Erro ao executar query:', { sql, params, error: err });
          reject(err);
        } else {
          resolve({
            lastID: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }

  /**
   * Get a single row from a query
   * @param {string} sql - SQL statement
   * @param {Array} params - Parameters for the query
   * @returns {Promise<Object|null>} - Single row or null
   */
  get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database não inicializado'));
      }

  this.db.get(sql, params, (err: Error | null, row: any) => {
        if (err) {
          logger.error('Erro ao executar query:', { sql, params, error: err });
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  /**
   * Get all rows from a query
   * @param {string} sql - SQL statement
   * @param {Array} params - Parameters for the query
   * @returns {Promise<Array>} - Array of rows
   */
  all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database não inicializado'));
      }

  this.db.all(sql, params, (err: Error | null, rows: any[]) => {
        if (err) {
          logger.error('Erro ao executar query:', { sql, params, error: err });
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Execute multiple statements in a transaction
   * @param {Function} callback - Function that receives db for transaction
   * @returns {Promise} - Promise that resolves when transaction completes
   */
  async transaction(callback: (db: Database) => Promise<void> | void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database não inicializado'));
      }
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        try {
          const result = callback(this);
          if (result && typeof result.then === 'function') {
            result
              .then(() => {
                this.db.run('COMMIT', (err: any) => {
                  if (err) reject(err);
                  else resolve(void 0);
                });
              })
              .catch((error: any) => {
                this.db.run('ROLLBACK');
                reject(error);
              });
          } else {
            this.db.run('COMMIT', (err: any) => {
              if (err) reject(err);
              else resolve(void 0);
            });
          }
        } catch (error: any) {
          this.db.run('ROLLBACK');
          reject(error);
        }
      });
    });
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err: any) => {
          if (err) {
            logger.error('Erro ao fechar banco de dados:', err);
            reject(err);
          } else {
            logger.info('Conexão com banco de dados fechada');
            this.isConnected = false;
            resolve(void 0);
          }
        });
      } else {
        resolve(void 0);
      }
    });
  }

  /**
   * Check if database is connected
   */
  isReady(): boolean {
    return this.isConnected && this.initialized && !!this.db;
  }
}

// Singleton instance
const database = new Database();
export default database;