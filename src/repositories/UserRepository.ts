import database from '../database/database';
import logger from '../utils/logger';
import {use} from "passport";

class UserRepository {
    /**
     * Create a new user by email
     * @param {Object} userData - User data
     * @returns {Promise<Object>} - Created user with ID
     */
    async create(userData: any): Promise<any> {
        try {
            const {
                id,
                email,
                name,
                firstName,
                lastName,
                contactPhone,
                picture,
                locale,
                passwordHash,
                provider,
            } = userData;

            if (!email) {
                throw new Error('User email is mandatory');
            }

            const result = await database.run(
                `INSERT INTO users (id, email, name, first_name, last_name, contact_phone, picture,
                                      locale, password_hash, provider)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    email,
                    name || null,
                    firstName || null,
                    lastName || null,
                    contactPhone || null,
                    picture || null,
                    locale || null,
                    passwordHash || null,
                    provider || 'application'
                ]
            );

            const user = await database.get(
                'SELECT * FROM users WHERE id = ?',
                [id]
            );
            logger.info(`User created: ${email}`, {userId: id, email: email});

            return user;
        } catch (error) {
            logger.error('Error creating user:', error);
            throw error;
        }
    }

    /**
     * Find user by user email
     * @param {string} email - User email
     * @returns {Promise<Object|null>} - User or null
     */
    async findByEmail(email: string): Promise<any> {
        try {
            return await database.get(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );
        } catch (error) {
            logger.error('Error fetching user by email:', error);
            throw error;
        }
    }

    /**
     * Find user by user id
     * @param {string} id - User id
     * @returns {Promise<Object|null>} - User or null
     */
    async findById(id: string): Promise<any> {
        try {
            return await database.get(
                'SELECT * FROM users WHERE id = ?',
                [id]
            );
        } catch (error) {
            logger.error('Error fetching user by id:', error);
            throw error;
        }
    }

    /**
     * Get all users
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} - Array of users
     */
    async findAll(filters: any = {}): Promise<any[]> {
        try {
            let sql = 'SELECT * FROM users';
            const params = [];
            const conditions = [];

            if (filters.email) {
                conditions.push('email = ?');
                params.push(filters.email);
            }

            if (filters.name) {
                conditions.push('name = ?');
                params.push(filters.name);
            }

            if (filters.first_name) {
                conditions.push('first_name = ?');
                params.push(filters.first_name);
            }

            if (filters.last_name) {
                conditions.push('last_name = ?');
                params.push(filters.last_name);
            }

            if (conditions.length > 0) {
                sql += ' WHERE ' + conditions.join(' AND ');
            }

            sql += ' ORDER BY created_at DESC';

            return await database.all(sql, params);
        } catch (error) {
            logger.error('Error listing users:', error);
            throw error;
        }
    }

    /**
     * Update user
     * @param {number} id - User ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object|null>} - Updated user or null
     */
    async update(id: string, updateData: any): Promise<any> {
        try {
            const allowedFields = [
                'reset_token', 'is_verified', 'verification_code', 'verification_code_expires',
                'email', 'name', 'first_name', 'last_name', 'reset_token_expires', 'picture',
                'locale', 'password_hash'
            ];

            // Convert camelCase to snake_case for database
            const fieldMapping = {
                'resetToken': 'reset_token',
                'isVerified': 'is_verified',
                'verificationCode': 'verification_code',
                'verificationCodeExpires': 'verification_code_expires',
                'email': 'email',
                'name': 'name',
                'firstName': 'first_name',
                'lastName': 'last_name',
                'resetTokenExpires': 'reset_token_expires',
                'picture': 'picture',
                'locale': 'locale',
                'passwordHash': 'password_hash'
            };

            const fields = [];
            const params = [];

            for (const [key, value] of Object.entries(updateData)) {
                // Convert camelCase to snake_case if needed
                const dbField = (fieldMapping as any)[key] || key;

                if (allowedFields.includes(dbField)) {
                    fields.push(`${dbField} = ?`);
                    params.push(value);
                }
            }

            if (fields.length === 0) {
                throw new Error('No valid fields to update');
            }

            params.push(id);

            await database.run(
                `UPDATE users
                 SET ${fields.join(', ')}
                 WHERE id = ?`,
                params
            );

            // Get the updated user directly
            const updatedUser = await database.get(
                'SELECT * FROM users WHERE id = ?',
                [id]
            );
            logger.info(`Updated User: ${id}`);

            return updatedUser;
        } catch (error) {
            logger.error('Error updating user:', error);
            throw error;
        }
    }

    /**
     * Delete user
     * @param {number} id - User ID
     * @returns {Promise<boolean>} - Success status
     */
    async delete(id: string): Promise<boolean> {
        try {
            const result = await database.run(
                'DELETE FROM users WHERE id = ?',
                [id]
            );

            const success = result.changes > 0;
            if (success) {
                logger.info(`User removed: ${id}`);
            }

            return success;
        } catch (error) {
            logger.error('Error removing user:', error);
            throw error;
        }
    }

    /**
     * Convert user data from snake_case to camelCase
     * @param {Object} user - User with snake_case fields
     * @returns {Object} - User with camelCase fields
     */
    convertToCamelCase(user: any): any {
        if (!user) return null;

        return {
            id: user.id,
            email: user.email,
            name: user.name,
            firstName: user.first_name,
            lastName: user.last_name,
            contactPhone: user.contact_phone,
            picture: user.picture,
            locale: user.locale,
            passwordHash: user.passwordHash,
            isVerified: user.is_verified,
            verificationCode: user.verification_code,
            verificationCodeExpires: user.verification_code_expires,
            resetToken: user.reset_token,
            reset_token_expires: user.reset_token_expires,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            provider: user.provider
        };
    }
}

export default new UserRepository();
