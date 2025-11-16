import fs from 'fs/promises';
import path from 'path';
import {NextFunction, Request, Response} from 'express';
import {asyncHandler, CustomError} from './errorHandler';
import logger from '../utils/logger';
import {SESSIONS_DIR} from '../utils/paths';
import crypto from "crypto";
import {verifyApiToken} from "../utils/encryption";
import {sendToQueue} from "../rabbitmq/producer";

/**
 * Handle login request and intercept QR code generation
 */
const loginHandler = asyncHandler(async (req: Request, res: Response) => {
    const device = (req as any).device;
    const proxyResponse = (req as any).proxyResponse;

    if (!device || !proxyResponse) {
        throw new CustomError('Device or proxy response not found', 500, 'INVALID_MIDDLEWARE_STATE');
    }

    const numberHash = device.numberHash;
    let responseData = proxyResponse.data;

    try {
        // Check if response contains QR code information in results
        if (responseData && responseData.results && responseData.results.qr_link && responseData.results.qr_link.includes('/statics/')) {
            logger.info(`QR code detected in response to ${numberHash}`);

            try {
                // Extract QR file name from the link
                const qrFileName = responseData.results.qr_link.split('/').pop();
                const sessionPath = path.join(SESSIONS_DIR, numberHash);
                const qrFilePath = path.join(sessionPath, 'statics', 'qrcode', qrFileName);

                // Log path for debug
                logger.debug(`Original path: ${responseData.results.qr_link}, Corrected path: ${qrFilePath}`);

                logger.info(`Trying to read QR file: ${qrFilePath}`);

                // Wait a bit for the file to be written
                await new Promise(resolve => setTimeout(resolve, 1000));

                try {
                    // Try to read the QR file
                    // Read the QR code file and convert to base64
                    const qrBuffer = await fs.readFile(qrFilePath);
                    const qrBase64 = qrBuffer.toString('base64');

                    // Replace qr_link with base64 data URL
                    responseData.results.qr_code = `data:image/png;base64,${qrBase64}`;

                    // Remove the old qr_link field
                    delete responseData.results.qr_link;

                    logger.info(`QR code successfully converted to base64: ${qrFileName}`);
                } catch (error) {
                    logger.warn(`QR file not found: ${qrFilePath}`);
                    // Keep the original qr_link so the client can try to access it directly
                    // This allows a fallback to the previous behavior
                    logger.info(`Keeping the original qr_link: ${responseData.results.qr_link}`);
                }
            } catch (qrError) {
                logger.error(`Error processing QR code for ${numberHash}:`, qrError);
                // Continue with original response if QR processing fails
            }
        }
        res.status(proxyResponse.status).json(responseData);

    } catch (error) {
        logger.error(`Error processing login response for ${numberHash}:`, error);
        // Fallback to original response
        res.status(proxyResponse.status).json(proxyResponse.data);
    }
});

// Simple JWT auth middleware
async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const auth = (req.headers.authorization || '').split(' ');
    if (auth.length !== 2 || auth[0] !== 'Bearer') return res.status(401).json({error: 'Missing token'});
    const token = auth[1];
    try {
        //verify that logged-in user owns the device
        const payload = await verifyApiToken(token);
        // attach user to req
        if (!payload) return res.status(401).json({error: 'user is unauthorized'});

        //should be done Asynchronously
        const userAgent = req.headers["user-agent"];
        const ip = req.ip;
        await sendToQueue({type: 'apiRequest', id: crypto.randomBytes(6).toString("hex"), payload: {requestId: crypto.randomUUID(),
                numberHash: payload.numberHash, userAgent: userAgent, ipAddress: ip,
                userId: payload.userId, requestMethod: req.method, endpoint: req.path}});
        req.user = {
            numberHash: payload.numberHash,
            userId: payload.userId,
            role: "admin",
        };
        next();
    } catch (err: any) {
        return res.status(401).json({error: `invalid credentials - ${err}`});
    }
}

export {loginHandler, requireAuth};
