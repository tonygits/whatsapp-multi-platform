import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger';
import { VOLUMES_DIR } from '../utils/paths';
import { Pool } from 'pg';

class Database {
    db: any;
    pgPool: Pool | null;
    dbPath: string;
    isConnected: boolean;
    initialized: boolean;
    usingPostgres: boolean;

    constructor() {
        this.db = null;
        this.pgPool = null;
        this.dbPath = path.join(VOLUMES_DIR, 'whatsapp.db');
        this.isConnected = false;
        this.initialized = false;
        this.usingPostgres = false;
    }

    /**
     * Initialize database connection and schema
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            logger.info('Database has already been initialized');
            return;
        }

        try {
            // Check if DB_URI is set to use PostgreSQL
            if (process.env.DB_URI) {
                logger.info('DB_URI set, initializing connection to PostgreSQL...');
                this.usingPostgres = true;

                // Create connection with PostgreSQL
                this.pgPool = new Pool({
                    connectionString: process.env.DB_URI
                });

                // Test connection
                const client = await this.pgPool.connect();
                try {
                    await client.query('SELECT 1');
                    logger.info('Connection to PostgreSQL successfully established');

                    // Initialize PostgreSQL schema
                    await this.initializeSchema();

                    this.isConnected = true;
                    this.initialized = true;
                } catch (error) {
                    logger.error('Error connecting to PostgreSQL:', error);
                    throw error;
                } finally {
                    client.release();
                }

                return;
            }

            // If you don't have a DB_URI, use SQLite
            logger.info('Initializing SQLite database...');

            // Ensure volumes directory exists
            const dbDir = path.dirname(this.dbPath);
            await fs.mkdir(dbDir, { recursive: true });

            // Create database connection
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    logger.error('Error connecting to database:', err);
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
            logger.info('SQLite database initialized successfully');

        } catch (error) {
            logger.error('Error initializing database:', error);
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
            if (this.usingPostgres) {
                // Execute as a single transaction for PostgreSQL
                const client = await this.pgPool!.connect();
                try {
                    await client.query('BEGIN');

                    // Execute each statement adapted for PostgreSQL
                    for (const statement of statements) {
                        if (statement) {
                            const pgStatement = statement
                                .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
                                .replace(/DATETIME/g, 'TIMESTAMP')
                                .replace(/BOOLEAN DEFAULT 0/g, 'BOOLEAN DEFAULT FALSE');

                            await client.query(pgStatement);
                        }
                    }

                    await client.query('COMMIT');
                    logger.info('PostgreSQL schema successfully applied');
                } catch (error) {
                    await client.query('ROLLBACK');
                    logger.error('Error applying schema in PostgreSQL:', error);
                    throw error;
                } finally {
                    client.release();
                }
            } else {
                // SQLite
                for (const statement of statements) {
                    if (statement) {
                        await this.run(statement);
                    }
                }
                logger.info('SQLite schema successfully applied');
            }
        } catch (error) {
            logger.error('Error applying schema:', error);
            throw error;
        }
    }

    /**
     * Run a SQL query that doesn't return rows
     * @param {string} sql - SQL statement
     * @param {Array} params - Parameters for the query
     * @returns {Promise<Object>} - Result with lastID and changes
     */
    async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
        if (this.usingPostgres) {
            try {
                if (!this.pgPool) {
                    throw new Error('Database not initialized');
                }

                // Adapt the query to PostgreSQL if necessary
                let pgSql = sql;

                // Check if it is an insert and add RETURNING id
                const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
                if (isInsert && !pgSql.includes('RETURNING')) {
                    pgSql = pgSql.trim();
                    if (pgSql.endsWith(';')) {
                        pgSql = pgSql.slice(0, -1);
                    }
                    pgSql += ' RETURNING id;';
                }

                // To replace ? for $1, $2, etc.
                if (params.length > 0) {
                    let paramIndex = 0;
                    pgSql = pgSql.replace(/\?/g, () => `$${++paramIndex}`);
                }

                const result = await this.pgPool.query(pgSql, params);
                return {
                    lastID: isInsert ? (result.rows[0]?.id || 0) : 0,
                    changes: result.rowCount || 0
                };
            } catch (error) {
                logger.error('Error executing query in PostgreSQL:', { sql, params, error });
                throw error;
            }
        } else {
            return new Promise((resolve, reject) => {
                if (!this.db) {
                    return reject(new Error('Database not initialized'));
                }
                this.db.run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
                    if (err) {
                        logger.error('Error executing query:', { sql, params, error: err });
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
    }

    /**
     * Get a single row from a query
     * @param {string} sql - SQL statement
     * @param {Array} params - Parameters for the query
     * @returns {Promise<Object|null>} - Single row or null
     */
    async get(sql: string, params: any[] = []): Promise<any> {
        if (this.usingPostgres) {
            try {
                if (!this.pgPool) {
                    throw new Error('Database not initialized');
                }

                // Adapt the query to PostgreSQL
                let pgSql = sql;

                // To replace ? for $1, $2, etc.
                if (params.length > 0) {
                    let paramIndex = 0;
                    pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);
                }

                const result = await this.pgPool.query(pgSql, params);
                return result.rows.length > 0 ? result.rows[0] : null;
            } catch (error) {
                logger.error('Error executing query in PostgreSQL:', { sql, params, error });
                throw error;
            }
        } else {
            return new Promise((resolve, reject) => {
                if (!this.db) {
                    return reject(new Error('Database not initialized'));
                }

                this.db.get(sql, params, (err: Error | null, row: any) => {
                    if (err) {
                        logger.error('Error executing query:', { sql, params, error: err });
                        reject(err);
                    } else {
                        resolve(row || null);
                    }
                });
            });
        }
    }

    /**
     * Get all rows from a query
     * @param {string} sql - SQL statement
     * @param {Array} params - Parameters for the query
     * @returns {Promise<Array>} - Array of rows
     */
    async all(sql: string, params: any[] = []): Promise<any[]> {
        if (this.usingPostgres) {
            try {
                if (!this.pgPool) {
                    throw new Error('Database not initialized');
                }

                // Adapt the query to PostgreSQL
                let pgSql = sql;

                // To replace ? for $1, $2, etc.
                if (params.length > 0) {
                    let paramIndex = 0;
                    pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);
                }

                const result = await this.pgPool.query(pgSql, params);
                return result.rows;
            } catch (error) {
                logger.error('Error executing query in PostgreSQL:', { sql, params, error });
                throw error;
            }
        } else {
            return new Promise((resolve, reject) => {
                if (!this.db) {
                    return reject(new Error('Database not initialized'));
                }

                this.db.all(sql, params, (err: Error | null, rows: any[]) => {
                    if (err) {
                        logger.error('Error executing query:', { sql, params, error: err });
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                });
            });
        }
    }

    /**
     * Execute multiple statements in a transaction
     * @param {Function} callback - Function that receives db for transaction
     * @returns {Promise} - Promise that resolves when transaction completes
     */
    async transaction(callback: (db: Database) => Promise<void> | void): Promise<void> {
        if (this.usingPostgres) {
            if (!this.pgPool) {
                throw new Error('Database not initialized');
            }

            const client = await this.pgPool.connect();

            try {
                await client.query('BEGIN');

                // Save the current pool and temporarily replace it with this client
                const originalPool = this.pgPool;
                this.pgPool = {
                    query: (text: string, params?: any[]) => client.query(text, params),
                    connect: () => Promise.resolve(client),
                    end: () => Promise.resolve(),
                    on: () => {},
                    // Add other required properties
                } as any;

                const result = callback(this);

                if (result && typeof result.then === 'function') {
                    await result;
                }

                await client.query('COMMIT');

                // Restore the original pool
                this.pgPool = originalPool;
            } catch (error) {
                await client.query('ROLLBACK');
                logger.error('Error during PostgreSQL transaction:', error);
                throw error;
            } finally {
                client.release();
            }
        } else {
            return new Promise((resolve, reject) => {
                if (!this.db) {
                    return reject(new Error('Database not initialized'));
                }
                this.db.serialize(() => {
                    this.db.run('BEGIN TRANSACTION');
                    try {
                        const result = callback(this);
                        if (result && typeof result.then === 'function') {
                            result
                                .then(() => {
                                    this.db.run('COMMIT', (err: string) => {
                                        if (err) {
                                            logger.error('Error completing transaction:', err);
                                            this.db.run('ROLLBACK');
                                            reject(err);
                                        } else {
                                            resolve();
                                        }
                                    });
                                })
                                .catch((err) => {
                                    logger.error('Error during transaction:', err);
                                    this.db.run('ROLLBACK');
                                    reject(err);
                                });
                        } else {
                            this.db.run('COMMIT', (err: string) => {
                                if (err) {
                                    logger.error('Error completing transaction:', err);
                                    this.db.run('ROLLBACK');
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            });
                        }
                    } catch (err) {
                        logger.error('Error during transaction:', err);
                        this.db.run('ROLLBACK');
                        reject(err);
                    }
                });
            });
        }
    }

    /**
     * Close database connection
     */
    async close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err: any) => {
                    if (err) {
                        logger.error('Error closing database:', err);
                        reject(err);
                    } else {
                        logger.info('Database connection closed');
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
