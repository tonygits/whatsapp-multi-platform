import { Request, Response, NextFunction } from 'express';
import deviceManager from '../services/deviceManager';
import {asyncHandler, CustomError} from "./errorHandler";
import {AuthenticatedRequest} from "../types/session";
import DeviceUtils from "../utils/deviceUtils";

// Middleware to resolve the device instance
const resolveInstance = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const numberHash = req.user?.numberHash as string
    if (!numberHash) {
        throw new CustomError('Header numberHash is required', 400, 'MISSING_INSTANCE_ID');
    }

    const isValid = DeviceUtils.validateDeviceHash(numberHash);
    if (!isValid){
        throw new Error("invalid number hash");
    }
    console.log('numberHash', numberHash);
// Search for the device by hash
  const device = await deviceManager.getDevice(numberHash);
  if (!device) {
    return res.status(404).json({ success: false, message: 'Phone number not found' });
  }
  (req as any).device = device;
  next();
});

export default resolveInstance;
