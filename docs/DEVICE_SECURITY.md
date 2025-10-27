# Device Security

## Overview

A system that uses deviceHash to securely identify devices without exposing personal data.

## Automatic Behavior

| Environment | Logs | APIs | Use |
|----------|------|------|-----|
| `development` | deviceHash | deviceHash | Local development|
| `staging` | deviceHash | deviceHash | Tests |  
| `production` | deviceHash | deviceHash | Production |

*The system always uses an automatically generated deviceHash*

## Configuration

### Environment Variables
```bash
# System automatically uses deviceHash
NODE_ENV=development # deviceHash for development
NODE_ENV=production # deviceHash for production
```

### Usage Examples
```bash
# Development
NODE_ENV=development npm start

# Production
NODE_ENV=production npm start

# Staging
NODE_ENV=staging npm start
```

## Implementation

### Device Hash for Identification
```Javascript
// System automatically generates deviceHash
// URLs use deviceHash: /api/devices (via deviceHash header)

POST /api/devices
{
  "webhookUrl": "https://meusite.com/webhook",
  "statusWebhookUrl": "https://meusite.com/status"
}
// Returns automatically generated deviceHash
```

### Secure Logs
```javascript
// System always uses deviceHash
logger.info(`Device: ${deviceHash}`);

// Debug with deviceHash
logger.debug(`Debug device: ${deviceHash}`);
```

## Device Hash

### Defaults
- **Format**: 16-character hexadecimal hash (`a1b2c3d4e5f67890`)
- **Generation**: Automatic via `crypto.randomBytes(8).toString('hex')`

### Identification
- **Unique**: Each device has a unique hash
- **Secure**: Does not expose personal data

## File Structure

```
src/utils/deviceUtils.js # deviceHash Utilities
src/database/schema.sql # unique device_hash
src/repositories/ # deviceHash Management
src/routes/devices.js # APIs with deviceHash
```

## Benefits

✅ **Development**: Consistent deviceHash
✅ **Production**: Security by design
✅ **Clean APIs**: Headers instead of URLs
✅ **Privacy**: No personal data exposure
✅ **Scalable**: Simple and unique identification
