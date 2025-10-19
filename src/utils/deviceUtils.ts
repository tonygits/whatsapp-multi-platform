import crypto from 'crypto';

class DeviceUtils {
  /**
   * Generates a random unique ID for the device
   * @returns {string} - Unique device ID (16 hexadecimal characters)
   */
  static generateDeviceHash(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Validates device hash format
   * @param {string} deviceHash - Device hash
   * @returns {boolean} - Whether valid
   */
  static validateDeviceHash(deviceHash: string): boolean {
    if (!deviceHash || typeof deviceHash !== 'string') return false;
    const hashRegex = /^[a-f0-9]{16}$/i;
    return hashRegex.test(deviceHash);
  }
}

export default DeviceUtils;
