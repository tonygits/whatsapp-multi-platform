import { Request, Response, NextFunction } from 'express';
import deviceManager from '../services/deviceManager';

// Middleware to resolve the device instance
const resolveInstance = async (req: Request, res: Response, next: NextFunction) => {
  const deviceHash = req.query.deviceHash || req.body.deviceHash || req.params.deviceHash || req.get('deviceHash');
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
