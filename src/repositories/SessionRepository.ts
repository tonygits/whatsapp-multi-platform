import database from '../database/database';
import logger from '../utils/logger';

class SessionRepository {
    /**
     * Create a new session for user
     * @param {Object} sessionData - Session data
     * @returns {Promise<Object>} - Created session with ID
     */
    async create(sessionData: any): Promise<any> {
        try {
            const {
                id,
                user_id,
                deactivated_at,
                user_agent,
                ip_address,
            } = sessionData;

            if (!user_id) {
                throw new Error('User id is mandatory');
            }

            const result = await database.run(
                `INSERT INTO sessions (id, user_id, deactivated_at, user_agent, ip_address)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    id,
                    user_id,
                    deactivated_at || null,
                    user_agent,
                    ip_address || null,
                ]
            );

            const session = await database.get(
                'SELECT * FROM sessions WHERE id = ?',
                [id]
            );
            logger.info(`Session created: ${id}`, {sessionId: id, user_id: user_id});

            return session;
        } catch (error) {
            logger.error('Error creating session:', error);
            throw error;
        }
    }

    /**
     * Find session by session id
     * @param {string} id - Session id
     * @returns {Promise<Object|null>} - Session or null
     */
    async findById(id: string): Promise<any> {
        try {
            return await database.get(
                'SELECT * FROM sessions WHERE id = ?',
                [id]
            );
        } catch (error) {
            logger.error('Error fetching session by id:', error);
            throw error;
        }
    }

    /**
     * Find session by session id
     * @param {string} userId - Session id
     * @returns {Promise<Object|null>} - Session or null
     */
    async listForUserId(userId: string): Promise<any> {
        try {
            return database.all(
                'SELECT * FROM sessions WHERE user_id = ?',
                [userId]
            )
        } catch (error) {
            logger.error('Error fetching session by id:', error);
            throw error;
        }
    }

    /**
     * Delete session
     * @param {number} id - Session ID
     * @returns {Promise<boolean>} - Success status
     */
    async delete(id: string): Promise<boolean> {
        try {
            await database.run(
                `UPDATE sessions
                 SET deactivated_at=now()
                 WHERE id = ?`,
                [id]
            );

            // Get the updated session directly
            const updatedSession = await database.get(
                'SELECT * FROM sessions WHERE id = ?',
                [id]
            );

            logger.info(`Updated Session: ${id}`);
            return updatedSession;
        } catch (error) {
            logger.error('Error removing session:', error);
            throw error;
        }
    }

    /**
     * Convert session data from snake_case to camelCase
     * @param {Object} session - Session with snake_case fields
     * @returns {Object} - Session with camelCase fields
     */
    convertToCamelCase(session: any): any {
        if (!session) return null;

        return {
            id: session.id,
            user_id: session.user_id,
            deactivated_at: session.deactivated_at,
            user_agent: session.user_agent,
            ip_address: session.ip_address,
            createdAt: session.created_at,
        };
    }
}

export default new SessionRepository();
