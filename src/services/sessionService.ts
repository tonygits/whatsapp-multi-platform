import logger from "../utils/logger";
import sessionRepository from "../repositories/SessionRepository";
import {Session} from "../types/session";

export async function createNewSession(partial: any): Promise<Session> {
    console.log("session svc create called")
    try {

        logger.info(`creating session for ${partial}`);

        // Create user record
        const result = await sessionRepository.create({
            id: partial.id,
            userId: partial.userId,
            userAgent: partial.userAgent,
            ipAddress: partial.ipAddress,
        });

        logger.info(`Session created successfully: ${result.id}`, {userId: result.user_id});

        return {
            id: result.id,
            userId: result.user_id,
            deactivatedAt: result.deactivated_at,
            userAgent: result.user_agent,
            ipAddress: result.user_agent,
            createdAt: result.created_at,
        }
    } catch (error) {
        logger.error(`Error creating session ${partial.id}:`, error);
        throw error;
    }
}

export async function getSessionById(id: string): Promise<Session | null> {
    try {
        const session = await sessionRepository.findById(id);

        if (!session) {
            return null;
        }

        return {
            id: session.id,
            userId: session.user_id,
            deactivatedAt: session.deactivated_at,
            userAgent: session.user_agent,
            ipAddress: session.ip_address,
            createdAt: session.created_at
        }
    } catch (error) {
        logger.error(`Error searching for session ${id}:`, error);
        throw error;
    }
}

export async function listSessionsForUser(userId: string): Promise<Session[]> {
    try {
        const sessions = await sessionRepository.listForUserId(userId);
        console.log(`got ${sessions.length} sessions`)
        if (Array.isArray(sessions)) {
            return sessions.map((session: any) => ({
                id: session.id,
                userId: session.user_id,
                deactivatedAt: session.deactivated_at,
                userAgent: session.user_agent,
                ipAddress: session.ip_address,
                createdAt: session.created_at,
            }));
        } else {
            logger.warn('findAll() did not return an array of sessions');
            return [];
        }
    } catch (error) {
        logger.error('Error listing sessions:', error);
        throw error;
    }
}

export async function deleteSession(id: string): Promise<Session | null> {
    try {
        const session = await sessionRepository.delete(id);

        if (!session) {
            return null;
        }

        return {
            id: session.id,
            userId: session.user_id,
            deactivatedAt: session.deactivated_at,
            userAgent: session.user_agent,
            ipAddress: session.ip_address,
            createdAt: session.created_at
        }
    } catch (error) {
        logger.error(`Error deleting for session ${id}:`, error);
        throw error;
    }
}
