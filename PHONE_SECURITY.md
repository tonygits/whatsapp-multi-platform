# Segurança de Números de Telefone

## Visão Geral

Sistema inteligente que protege números de telefone baseado no ambiente de execução.

## Comportamento Automático

| Ambiente | Logs | APIs | Uso |
|----------|------|------|-----|
| `development` | Completos | Completos | Desenvolvimento local |
| `staging` | Mascarados* | Mascarados* | Testes |  
| `production` | Mascarados | Mascarados | Produção |

*\*Configurável via `MASK_PHONE_NUMBERS=false`*

## Configuração

### Variáveis de Ambiente
```bash
# Controle global (sobrescreve NODE_ENV)
MASK_PHONE_NUMBERS=true   # Forçar mascaramento
MASK_PHONE_NUMBERS=false  # Desabilitar mascaramento

# Automático por ambiente
NODE_ENV=development  # Números completos
NODE_ENV=production   # Números mascarados
```

### Exemplos de Uso
```bash
# Desenvolvimento (números completos)
NODE_ENV=development npm start

# Produção (números mascarados)
NODE_ENV=production npm start

# Debug em staging (números completos)
NODE_ENV=staging MASK_PHONE_NUMBERS=false npm start
```

## Implementação

### Device Hash para URLs
```javascript
// Em vez de: /api/devices/+5511999999999
// Usar: /api/devices/abc123def456

POST /api/devices
{
  "phoneNumber": "5511999999999",  // Apenas no registro
  "name": "Device Name"
}
// Retorna deviceHash para operações futuras
```

### Logs Inteligentes
```javascript
// Log normal (segue ambiente)
logger.info(`Device: ${PhoneUtils.maskForLog(phone, 'info')}`);

// Debug (sempre completo para tracking)
logger.debug(`Debug: ${PhoneUtils.maskForLog(phone, 'debug')}`);
```

## Mascaramento

### Padrões
- **Brasil**: `5511999999999` → `5511*****9999`
- **Internacional**: `1234567890` → `12*****890`

### Logs de Debug
- **Sempre completos** independente do ambiente
- Use `logger.debug()` quando precisar do número completo

## Estrutura de Arquivos

```
src/utils/phoneUtils.js     # Utilitários de mascaramento
src/database/schema.sql     # device_hash e phone_hash
src/repositories/           # Geração automática de hashes
src/routes/devices.js       # URLs com device_hash
```

## Benefícios

✅ **Desenvolvimento**: Tracking completo  
✅ **Produção**: Segurança automática  
✅ **URLs Limpas**: device_hash em vez de números  
✅ **Debug**: Logs de debug sempre completos  
✅ **Flexível**: Controle por ambiente