# 📡 Status Webhook Documentation

## 📋 Table of Contents
- [Overview](#overview)
- [Configuration](#configuration)
- [Supported Events](#supported-events)
- [Payload Format](#payload-format)
- [Security](#security)
- [Practical Examples](#practical-examples)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

## 🔍 Overview

The Status Webhook system allows your application to receive real-time notifications about status changes on connected WhatsApp phone numbers. This includes connection, disconnection, authentication, and other important lifecycle events for phone numbers and containers.

### Main Features:
- Real-Time: Instant notifications about status changes
- Security: HMAC-SHA256 signature for authenticity verification
- Retry Logic: Automatic retry system with exponential backoff
- Non-Blocking: Does not interfere with the operation of the main API

## ⚙️ Configuration

### 1. Phone number Registration
Configure the status webhook during phone number registration:

```bash
curl -X POST http://localhost:3000/api/phone_numbers \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic <token>" \
  -d '{
    "statusWebhookUrl": "https://meusite.com/webhook/status",
    "statusWebhookSecret": "meu-secret-super-seguro"
  }'
```

### 2. Webhook Update
Update an existing phone number's webhook:

```bash
curl -X PUT http://localhost:3000/api/phone_numbers\
  -H "Content-Type: application/json" \
  -H "Authorization: Basic <token>" \
  -H "numberHash: a1b2c3d4e5f67890" \
  -d '{
    "statusWebhookUrl": "https://novosite.com/webhook/status",
    "statusWebhookSecret": "new-secret"
  }'
```

## 📊 Supported Events

| Event | Code                 | Description                             | When It Occurs                                  |
|--------|----------------------|-----------------------------------------|-------------------------------------------------|
| `login_success` | `LOGIN_SUCCESS`      | Phone number successfully authenticated | After login via QR Code or existing session     |
| `connected` | `LIST_PHONE_NUMBERS` | Phone number Connected and Ready        | When the phone number is online and operational |
| `disconnected` | `LIST_PHONE_NUMBERS`       | Phone number Disconnected               | Lost Connection or Logged Out                   |
| `auth_failed` | `AUTH_FAILURE`       | Authentication failed                   | Invalid credentials or session expired          |
| `container_event` | `GENERIC`            | Other container events                  | Various WhatsApp process events                 |

## 📦 Payload Format

### Base Structure
```json
{
  "phone_number": {
    "numberHash": "string",
    "status": "string"
  },
  "event": {
    "type": "string",
    "code": "string",
    "message": "string",
    "data": "object|null"
  },
  "timestamp": "string (ISO 8601)"
}
```

### Detailed Fields

#### Phone number Object
- `numberHash`: Unique number hash (format: `a1b2c3d4e5f67890`)
- `status`: Current phone number status (see status table below)

#### Phone number Status
| Status | Description           | When It Occurs                            | Context             |
|--------|-----------------------|-------------------------------------------|---------------------|
| `connected` | WhatsApp connected    | Phone number authenticated and functional | WhatsApp status     |
| `disconnected` | WhatsApp disconnected | Lost connection to WhatsApp               | WhatsApp status     |
| `active` | Phone number active   | Container + WhatsApp working              | Phone number status |
| `running` | Container running     | WhatsApp process running                  | Container status    |
| `stopped` | Container stopped     | WhatsApp process terminated               | Container status    |
| `error` | System error          | Container or authentication failure       | General status      |

#### Event Object
- `type`: Event type (see events table)
- `code`: Internal event code
- `message`: Human-readable description of the event
- `data`: Additional event-specific data (optional)

## 🔐 Security

### Signature Verification
If you configured a `statusWebhookSecret`, all requests will include the `X-Webhook-Signature` header:

```
X-Webhook-Signature: a1b2c3d4e5f6...
```

### Validation (Node.js)
```javascript
const crypto = require('crypto');

function validateWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
    
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Uso
app.post('/webhook/status', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!validateWebhook(payload, signature, 'meu-secret')) {
    return res.status(401).send('Unauthorized');
  }
  
  // Processar webhook...
  res.status(200).send('OK');
});
```

### Validation (Python)
```python
import hmac
import hashlib

def validate_webhook(payload, signature, secret):
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature)
```

## 💡 Practical Examples

### 1. Successful Login
```json
{
  "phone_number": {
    "numberHash": "a1b2c3d4e5f67890",
    "status": "connected"
  },
  "event": {
    "type": "login_success",
    "code": "LOGIN_SUCCESS",
    "message": "Successfully pair with WhatsApp phone number",
    "phone_number_info": {
      "id": "phone_number-12@s.whatsapp.net"
    }
  },
  "timestamp": "2025-08-12T15:30:45.123Z"
}
```

### 2. Connected Phone number
```json
{
  "phone_number": {
    "numberHash": "a1b2c3d4e5f67890",
    "status": "connected"
  },
  "event": {
    "type": "connected",
    "code": "LIST_DEVICES", 
    "message": "Phone number connected and ready",
    "phone_numbers": [
      {
        "phone_number": "phone_number-12@s.whatsapp.net"
      }
    ]
  },
  "timestamp": "2025-08-12T15:30:50.456Z"
}
```

### 3. Phone number Disconnected
```json
{
  "phone_number": {
    "numberHash": "a1b2c3d4e5f67890",
    "status": "disconnected"
  },
  "event": {
    "type": "disconnected", 
    "code": "LIST_DEVICES",
    "message": "Phone number disconnected",
    "phone_numbers": []
  },
  "timestamp": "2025-08-12T16:45:12.345Z"
}
```

### 4. Authentication Failure
```json
{
  "phone_number": {
    "numberHash": "a1b2c3d4e5f67890",
    "status": "error"
  },
  "event": {
    "type": "auth_failed",
    "code": "AUTH_FAILURE", 
    "message": "Authentication failed - session expired",
    "error": {
      "reason": "session_expired",
      "details": "WhatsApp session has expired"
    }
  },
  "timestamp": "2025-08-12T14:20:15.678Z"
}
```

### 5. Container Started
```json
{
  "phone_number": {
    "numberHash": "a1b2c3d4e5f67890",
    "status": "running"
  },
  "event": {
    "type": "container_event",
    "code": "CONTAINER_START",
    "message": "WhatsApp container started successfully",
    "data": {
      "container_id": "whatsapp-a1b2c3d4e5f67890",
      "port": 8000
    }
  },
  "timestamp": "2025-08-12T15:25:00.123Z"
}
```

### 6. Container Stopped
```json
{
  "phone_number": {
    "numberHash": "a1b2c3d4e5f67890",
    "status": "stopped"
  },
  "event": {
    "type": "container_event",
    "code": "CONTAINER_STOP",
    "message": "WhatsApp container stopped",
    "data": {
      "reason": "manual_stop",
      "exit_code": 0
    }
  },
  "timestamp": "2025-08-12T16:30:45.456Z"
}
```

## 🚨 Error Handling

### Retry System
The system implements automatic retry with the following characteristics:

- **Attempts**: 3 attempts per webhook
- **Backoff**: Exponential (1s, 2s, 4s)
- **Timeout**: 10 seconds per attempt
- **Accepted HTTP Status**: 200-299

### Error Logs
Errors are logged automatically:
```
2025-08-12T15:30:45.123Z [WARN] Webhook failed (attempt 1/3), retrying in 1000ms
2025-08-12T15:30:46.456Z [ERROR] Error sending webhook to a1b2c3d4e5f67890: timeout
```

### Debugging Endpoint
For debugging, you can use services like:
- [webhook.site](https://webhook.site)
- [ngrok](https://ngrok.com) for local testing
- [requestbin.com](https://requestbin.com)

## ✅ Best Practices

### 1. Endpoint Implementation
```javascript
app.post('/webhook/status', express.raw({type: 'application/json'}), (req, res) => {
  try {
      // Always respond quickly
      res.status(200).send('OK');

      // Process asynchronously
      processWebhook(req.body).catch(console.error);
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

async function processWebhook(payload) {
  const event = JSON.parse(payload);
  
  switch (event.event.type) {
    case 'connected':
      await handlePhoneConnected(event);
      break;
    case 'disconnected':
      await handlePhoneDisconnected(event);
      break;
    case 'login_success':
      await handleLoginSuccess(event);
      break;
    case 'auth_failed':
      await handleAuthFailed(event);
      break;
    case 'container_event':
      await handleContainerEvent(event);
      break;
      // ... other events
  }

// Also process by phone status
  switch (event.phone.status) {
    case 'running':
      await handleContainerRunning(event);
      break;
    case 'stopped':
      await handleContainerStopped(event);
      break;
    case 'error':
      await handlePhoneError(event);
      break;
  }
}
```

### 2. Monitoring
- **Latency**: Monitor your endpoint's response time
- **Error Rate**: Track failed webhooks
- **Volume**: Monitor the number of events received

### 3. Idempotency
Implement idempotency using the timestamp:
```javascript
const processedEvents = new Set();

function processWebhook(event) {
  const eventId = `${event.phone.numberHash}-${event.timestamp}`;
  
  if (processedEvents.has(eventId)) {
    console.log('Event already processed, skipping');
    return;
  }
  
  processedEvents.add(eventId);
    // Process event...
}
```

### 4. Rate Limiting
Implement rate limiting on your endpoint to avoid overload:
```javascript
const rateLimit = require('express-rate-limit');

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, //maximum 100 requests per minute
  message: 'Too many webhook requests'
});

app.use('/webhook/status', webhookLimiter);
```

## 🔧 Troubleshooting

### Webhook not received
1. Verify that the URL is externally accessible
2. Confirm that the endpoint responds with status 200-299
3. Check the application logs for errors

### Signature verification failed
1. Confirm that you are using the correct secret
2. Verify that you are using the raw (not parsed) payload
3. Implement logging to debug the signature

### Webhook timeout
1. Optimize your endpoint to respond quickly
2. Process data asynchronously after responding
3. Consider increasing the timeout if necessary

---

## 📞 Support

For questions or issues:
- Check the application logs in `/logs/`
- See the API documentation in `/api/docs`
- Report issues in the project repository
