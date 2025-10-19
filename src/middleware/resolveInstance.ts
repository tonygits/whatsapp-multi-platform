import { Request, Response, NextFunction } from 'express';
import deviceManager from '../services/newDeviceManager';

// Middleware to resolve the device instance
const resolveInstance = async (req: Request, res: Response, next: NextFunction) => {
  const deviceHash = req.query['x-instance-id'] || req.body['x-instance-id'] || req.params['x-instance-id'];
  if (!deviceHash || typeof deviceHash !== 'string') {
    return res.status(400).json({ success: false, message: 'deviceHash is required' });
  }
// Search for the device by hash
  const device = await deviceManager.getDevice(deviceHash);
  if (!device) {
    return res.status(404).json({ success: false, message: 'Device not found' });
  }
  (req as any).device = device;
  next();
};

export default resolveInstance;
