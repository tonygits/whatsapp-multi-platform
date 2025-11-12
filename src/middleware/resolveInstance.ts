import { Request, Response, NextFunction } from 'express';
import deviceManager from '../services/deviceManager';
import {asyncHandler, CustomError} from "./errorHandler";
import {AuthenticatedRequest} from "../types/session";
import DeviceUtils from "../utils/deviceUtils";

// Middleware to resolve the device instance
const resolveInstance = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const deviceHash = req.user?.deviceHash as string
    if (!deviceHash) {
        throw new CustomError('Header deviceHash is required', 400, 'MISSING_INSTANCE_ID');
    }

    const isValid = DeviceUtils.validateDeviceHash(deviceHash);
    if (!isValid){
        throw new Error("invalid device hash");
    }
    console.log('deviceHash', deviceHash);
// Search for the device by hash
  const device = await deviceManager.getDevice(deviceHash);
  if (!device) {
    return res.status(404).json({ success: false, message: 'Device not found' });
  }
  (req as any).device = device;
  next();
});

export default resolveInstance;
