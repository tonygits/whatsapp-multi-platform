import {Request} from 'express';
export type Session = {
    id: string;
    userId: string;
    deactivatedAt?: string;
    userAgent?: string;
    ipAddress?: string,
    createdAt: string;
};

export interface AuthUser {
    userId: string;
    sessionId?: string;
    role?: string;
    // add other claims you expect
}

export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
}
