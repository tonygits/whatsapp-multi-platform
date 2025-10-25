import database from '../database/database';
import logger from '../utils/logger';
import {NextFunction, Request, Response} from 'express';
import {verifyJwt} from "../utils/jwt";
import {getSessionById} from "../services/sessionService";
import {Session} from "../types/session";

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

    async generateUserSession(id: string, userId: string): Promise<Session | null> {
        try {
            if (!id) {
                return null;
            }

            const session = await getSessionById(id)
            if (!session || session.deactivatedAt) {
                logger.info(`session for user ${userId} is inactive`);
                return null
            }

            if (userId === session?.userId) {
                logger.info(`Authenticated session for user ${userId}`);
                return session;
            } else {
                logger.warn(`Authentication failed for user ${userId}`);
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
        const header = req.headers;

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
        const session = await authManager.generateUserSession(sub, iss as string);

        if (!session) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
                error: 'INVALID_CREDENTIALS'
            });
        }

        //verify that logged-in user owns the device
        console.log('header device hash', header['x-instance-id']);

        // Add user info to request
        req.user = {
            userId: (session.userId ?? session.userId) as string,
            sessionId: session.id as string | undefined,
            role: "admin",
        };

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

export {authManager, authMiddleware};
