const crypto = require('crypto');

class PhoneUtils {
  /**
   * Mascara um número de telefone baseado no ambiente/configuração
   * @param {string} phoneNumber - Número de telefone completo
   * @param {Object} options - Opções de mascaramento
   * @returns {string} - Número mascarado ou completo
   */
  static maskPhoneNumber(phoneNumber, options = {}) {
    if (!phoneNumber) return '';
    
    // Verificar se deve mascarar baseado no ambiente
    const shouldMask = this._shouldMaskPhone(options);
    
    if (!shouldMask) {
      return phoneNumber; // Retorna número completo em desenvolvimento/debug
    }
    
    // Para números brasileiros: +5511999999999 → +5511*****9999
    if (phoneNumber.startsWith('+55')) {
      return phoneNumber.replace(/(\+55)(\d{2})\d{5}(\d{4})/, '$1$2*****$3');
    }
    
    // Para outros números internacionais: +1234567890 → +12*****890
    if (phoneNumber.startsWith('+')) {
      const match = phoneNumber.match(/(\+\d{2})\d*(\d{3})$/);
      if (match) {
        return `${match[1]}*****${match[2]}`;
      }
    }
    
    // Fallback: mascarar parte central
    if (phoneNumber.length > 6) {
      const start = phoneNumber.substring(0, 3);
      const end = phoneNumber.substring(phoneNumber.length - 3);
      return `${start}*****${end}`;
    }
    
    return phoneNumber;
  }

  /**
   * Determina se deve mascarar o número baseado no ambiente e configurações
   * @param {Object} options - Opções de configuração
   * @returns {boolean} - Se deve mascarar
   * @private
   */
  static _shouldMaskPhone(options = {}) {
    // Verificar opção explícita
    if (options.forceMask === true) return true;
    if (options.forceMask === false) return false;
    
    // Verificar variável de ambiente
    const maskingEnabled = process.env.MASK_PHONE_NUMBERS;
    if (maskingEnabled !== undefined) {
      return maskingEnabled.toLowerCase() === 'true';
    }
    
    // Baseado no NODE_ENV
    const env = process.env.NODE_ENV || 'development';
    
    switch (env.toLowerCase()) {
      case 'production':
      case 'prod':
        return true; // Mascarar em produção
      case 'staging':
      case 'test':
        return options.stagingMask !== false; // Mascarar por padrão, mas pode ser desabilitado
      case 'development':
      case 'dev':
      case 'local':
      default:
        return false; // Não mascarar em desenvolvimento
    }
  }

  /**
   * Versão para logs - sempre considera o contexto de logging
   * @param {string} phoneNumber - Número de telefone
   * @param {string} logLevel - Nível do log (debug, info, warn, error)
   * @returns {string} - Número formatado para log
   */
  static maskForLog(phoneNumber, logLevel = 'info') {
    if (!phoneNumber) return '';
    
    // Em logs de debug, sempre mostrar completo
    if (logLevel === 'debug') {
      return phoneNumber;
    }
    
    // Para outros níveis, seguir configuração padrão
    return this.maskPhoneNumber(phoneNumber);
  }

  /**
   * Gera um hash SHA-256 para o número de telefone
   * @param {string} phoneNumber - Número de telefone
   * @returns {string} - Hash SHA-256
   */
  static hashPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    return crypto.createHash('sha256').update(phoneNumber).digest('hex');
  }

  /**
   * Gera um ID único para o dispositivo
   * @param {string} phoneNumber - Número de telefone
   * @returns {string} - ID único do dispositivo
   */
  static generateDeviceId(phoneNumber) {
    if (!phoneNumber) return null;
    // Combina timestamp com hash do número para garantir unicidade
    const timestamp = Date.now().toString();
    const phoneHash = this.hashPhoneNumber(phoneNumber);
    const combined = `${timestamp}-${phoneHash}`;
    
    return crypto.createHash('sha256')
      .update(combined)
      .digest('hex')
      .substring(0, 16); // 16 caracteres para facilitar uso
  }

  /**
   * Valida formato de número de telefone
   * @param {string} phoneNumber - Número de telefone
   * @returns {boolean} - Se é válido
   */
  static validatePhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;
    const phoneRegex = /^\d{10,15}$/;
    return phoneRegex.test(phoneNumber);
  }

  /**
   * Extrai código do país do número
   * @param {string} phoneNumber - Número de telefone
   * @returns {string|null} - Código do país
   */
  static getCountryCode(phoneNumber) {
    if (!phoneNumber || !phoneNumber.startsWith('+')) return null;
    
    // Códigos comuns
    const countryCodes = {
      '+55': 'BR',
      '+1': 'US',
      '+44': 'UK',
      '+49': 'DE',
      '+33': 'FR',
      '+39': 'IT',
      '+34': 'ES'
    };
    
    for (const [code, country] of Object.entries(countryCodes)) {
      if (phoneNumber.startsWith(code)) {
        return country;
      }
    }
    
    return null;
  }
}

module.exports = PhoneUtils;