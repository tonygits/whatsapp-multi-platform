# Device Security

## Overview

A system that uses numberHash to securely identify sessions without exposing personal data.

## Automatic Behavior

| Environment | Logs       | APIs       | Use |
|----------|------------|------------|-----|
| `development` | numberHash | numberHash | Local development|
| `staging` | numberHash | numberHash | Tests |  
| `production` | numberHash | numberHash | Production |

*The system always uses an automatically generated numberHash*

## Configuration

### Environment Variables
```bash
# System automatically uses numberHash
NODE_ENV=development # numberHash for development
NODE_ENV=production # numberHash for production
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

### Phone Number Hash for Identification
```Javascript
// System automatically generates numberHash
// URLs use numberHash: /api/phone_numbers (via numberHash header)

POST /api/numbers
{
  "webhookUrl": "https://meusite.com/webhook",
  "statusWebhookUrl": "https://meusite.com/status"
}
// Returns automatically generated numberHash
```

### Secure Logs
```javascript
// System always uses numberHash
logger.info(`PhoneNumber: ${numberHash}`);

// Debug with numberHash
logger.debug(`Debug Phone Number: ${numberHash}`);
```

## Device Hash

### Defaults
- **Format**: 16-character hexadecimal hash (`a1b2c3d4e5f67890`)
- **Generation**: Automatic via `crypto.randomBytes(8).toString('hex')`

### Identification
- **Unique**: Each phone number has a unique hash
- **Secure**: Does not expose personal data

## File Structure

```
src/utils/numberUtils.js # numberHash Utilities
src/database/schema.sql # unique _hash
src/repositories/ # numberHash Management
src/routes/numbers.js # APIs with phoneNumberHash
```

## Benefits

✅ **Development**: Consistent numberHash
✅ **Production**: Security by design
✅ **Clean APIs**: Headers instead of URLs
✅ **Privacy**: No personal data exposure
✅ **Scalable**: Simple and unique identification
