# API Documentation

## Overview

WhatsApp Multi-Platform API Gateway to manage Wapflow WhatsApp Phone Numbers.

## Authentication

```bash
Authorization: Bearer <jwt_token>
```

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}
```

## Devices

### Register Phone Number
```http
POST /api/phone_numbers
{
  "webhookUrl": "https://meusite.com/webhook",
  "statusWebhookUrl": "https://meusite.com/status"
}
```
**Returns:** Auto-generated `numberHash` for future operations

### Device Operations (using numberHash header)
```http
GET    /api/phone_numbers/info              # Get Phone Number info
POST   /api/phone_numbers/start             # Start container
POST   /api/phone_numbers/stop              # Stop container
GET    /api/login                     # Get QR code
DELETE /api/phone_numbers                   # Remove phone number

# All operations require:
numberHash: a1b2c3d4e5f67890
```

## Messages

### Send Message
```http
POST /api/send/message
numberHash: a1b2c3d4e5f67890
{
  "phone": "+5511888888888@s.whatsapp.net",
  "message": "Hello World"
}
```

## Environment Configuration

```bash
NODE_ENV=development  # Development environment
NODE_ENV=production   # Production environment
# System uses deviceHash for all identification
```

## OpenAPI Documentation

- **Swagger UI**: `/docs`

- **OpenAPI YAML**: `/docs/openapi.yaml`
