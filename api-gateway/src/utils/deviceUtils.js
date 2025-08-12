const crypto = require('crypto');

class DeviceUtils {
  /**
   * Gera um ID único aleatório para o dispositivo
   * @returns {string} - ID único do dispositivo (16 caracteres hexadecimais)
   */
  static generateDeviceHash() {
    // Gera 8 bytes aleatórios e converte para hex (16 caracteres)
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Valida formato de device hash
   * @param {string} deviceHash - Device hash
   * @returns {boolean} - Se é válido
   */
  static validateDeviceHash(deviceHash) {
    if (!deviceHash || typeof deviceHash !== 'string') return false;
    // Device hash deve ter exatamente 16 caracteres hexadecimais
    const hashRegex = /^[a-f0-9]{16}$/i;
    return hashRegex.test(deviceHash);
  }
}

module.exports = DeviceUtils;