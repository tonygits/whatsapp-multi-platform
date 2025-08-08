# API Documentation

## Overview

WhatsApp Multi-Platform API Gateway para gerenciar múltiplos dispositivos WhatsApp.

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

### Register Device
```http
POST /api/devices
{
  "phoneNumber": "5511999999999",
  "name": "Device Name"
}
```
**Returns:** `deviceHash` for future operations

### Device Operations
```http
GET    /api/devices/{deviceHash}     # Get device info
POST   /api/devices/{deviceHash}/start    # Start container
POST   /api/devices/{deviceHash}/stop     # Stop container
GET    /api/devices/{deviceHash}/qr       # Get QR code
DELETE /api/devices/{deviceHash}          # Remove device
```

## Messages

### Send Message
```http
POST /api/messages/send
{
  "from": "5511999999999",
  "to": "5511888888888", 
  "message": "Hello World"
}
```



## Environment Configuration

```bash
NODE_ENV=development  # Full phone numbers in logs
NODE_ENV=production   # Masked phone numbers
MASK_PHONE_NUMBERS=true   # Force masking
```

## OpenAPI Documentation

- **Swagger UI**: `/docs`

- **OpenAPI YAML**: `/docs/openapi.yaml`