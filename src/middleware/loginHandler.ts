import fs from 'fs/promises';
import path from 'path';
import {NextFunction, Request, Response} from 'express';
import { asyncHandler, CustomError } from './errorHandler';
import logger from '../utils/logger';
import { SESSIONS_DIR } from '../utils/paths';
import {verifyJwt} from "../utils/jwt";
import {getUserById} from "../services/userService";

/**
 * Handle login request and intercept QR code generation
 */
const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const device = (req as any).device;
  const proxyResponse = (req as any).proxyResponse;
  
  if (!device || !proxyResponse) {
    throw new CustomError('Device or proxy response not found', 500, 'INVALID_MIDDLEWARE_STATE');
  }

  const deviceHash = device.deviceHash;
  let responseData = proxyResponse.data;

  try {
    // Check if response contains QR code information in results
    if (responseData && responseData.results && responseData.results.qr_link && responseData.results.qr_link.includes('/statics/')) {
      logger.info(`QR code detected in response to ${deviceHash}`);
      
      try {
        // Extract QR file path from the link
        const qrFileName = responseData.results.qr_link.split('/').pop();
        const sessionPath = path.join(SESSIONS_DIR, deviceHash);
        const qrFilePath = path.join(sessionPath, 'statics', 'qrcode', qrFileName);
        
        logger.info(`Trying to read QR file: ${qrFilePath}`);
        
        // Wait a bit for the file to be written
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if file exists and read it
        const qrExists = await fs.access(qrFilePath).then(() => true).catch(() => false);
        
        if (qrExists) {
          // Read the QR code file and convert to base64
          const qrBuffer = await fs.readFile(qrFilePath);
          const qrBase64 = qrBuffer.toString('base64');
          
          // Replace qr_link with base64 data URL
          responseData.results.qr_code = `data:image/png;base64,${qrBase64}`;
          
          // Remove the old qr_link field
          delete responseData.results.qr_link;
          
          logger.info(`QR code converted to base64 to ${deviceHash}`);
        } else {
          logger.warn(`QR file not found: ${qrFilePath}`);
          // Keep original response if file doesn't exist
        }
        
      } catch (qrError) {
        logger.error(`Error processing QR code for ${deviceHash}:`, qrError);
        // Continue with original response if QR processing fails
      }
    }

    res.status(proxyResponse.status).json(responseData);
    
  } catch (error) {
    logger.error(`Error processing login response for ${deviceHash}:`, error);
    // Fallback to original response
    res.status(proxyResponse.status).json(proxyResponse.data);
  }
});

// Simple JWT auth middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
    const auth = (req.headers.authorization || '').split(' ');
    if (auth.length !== 2 || auth[0] !== 'Bearer') return res.status(401).json({ error: 'Missing token' });
    const token = auth[1];
    try {
        const payload = verifyJwt(token);
        // attach user to req
        const user = getUserById(payload.sub);
        if (!user) return res.status(401).json({ error: 'User not found' });
        (req as any).user = user;
        next();
    } catch (err: any) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

export { loginHandler, requireAuth};
