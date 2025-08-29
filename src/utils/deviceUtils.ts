import crypto from 'crypto';

class DeviceUtils {
  /**
   * Gera um ID único aleatório para o dispositivo
   * @returns {string} - ID único do dispositivo (16 caracteres hexadecimais)
   */
  static generateDeviceHash(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Valida formato de device hash
   * @param {string} deviceHash - Device hash
   * @returns {boolean} - Se é válido
   */
  static validateDeviceHash(deviceHash: string): boolean {
    if (!deviceHash || typeof deviceHash !== 'string') return false;
    const hashRegex = /^[a-f0-9]{16}$/i;
    return hashRegex.test(deviceHash);
  }
}

export default DeviceUtils;