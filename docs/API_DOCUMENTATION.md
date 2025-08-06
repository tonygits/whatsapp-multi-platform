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

### Proxy Routes
Direct access to WhatsApp container API (66+ endpoints):

#### App Management
```http
GET /proxy/whatsapp/{phoneNumber}/app/login
GET /proxy/whatsapp/{phoneNumber}/app/login-with-code
GET /proxy/whatsapp/{phoneNumber}/app/logout
GET /proxy/whatsapp/{phoneNumber}/app/reconnect
GET /proxy/whatsapp/{phoneNumber}/app/devices
```

#### Send Messages & Media
```http
POST /proxy/whatsapp/send/message
POST /proxy/whatsapp/send/image
POST /proxy/whatsapp/send/audio
POST /proxy/whatsapp/send/video
POST /proxy/whatsapp/send/file
POST /proxy/whatsapp/send/contact
POST /proxy/whatsapp/send/link
POST /proxy/whatsapp/send/location
POST /proxy/whatsapp/send/poll
POST /proxy/whatsapp/send/presence
POST /proxy/whatsapp/send/chat-presence
```

#### User Information
```http
GET /proxy/whatsapp/{phoneNumber}/user/info
GET /proxy/whatsapp/{phoneNumber}/user/avatar  
POST /proxy/whatsapp/{phoneNumber}/user/avatar
POST /proxy/whatsapp/{phoneNumber}/user/pushname
GET /proxy/whatsapp/{phoneNumber}/user/my/privacy
GET /proxy/whatsapp/{phoneNumber}/user/my/groups
GET /proxy/whatsapp/{phoneNumber}/user/my/contacts
GET /proxy/whatsapp/{phoneNumber}/user/check
GET /proxy/whatsapp/{phoneNumber}/user/business-profile
```

#### Message Management
```http
POST /proxy/whatsapp/{phoneNumber}/message/{message_id}/revoke
POST /proxy/whatsapp/{phoneNumber}/message/{message_id}/delete
POST /proxy/whatsapp/{phoneNumber}/message/{message_id}/reaction
POST /proxy/whatsapp/{phoneNumber}/message/{message_id}/update
POST /proxy/whatsapp/{phoneNumber}/message/{message_id}/read
POST /proxy/whatsapp/{phoneNumber}/message/{message_id}/star
```

#### Chat Management
```http
GET /proxy/whatsapp/{phoneNumber}/chats
GET /proxy/whatsapp/{phoneNumber}/chat/{chat_jid}/messages
POST /proxy/whatsapp/{phoneNumber}/chat/{chat_jid}/pin
POST /proxy/whatsapp/{phoneNumber}/chat/{chat_jid}/label
```

#### Group Management
```http
GET /proxy/whatsapp/{phoneNumber}/group/info
POST /proxy/whatsapp/{phoneNumber}/group
POST /proxy/whatsapp/{phoneNumber}/group/participants
POST /proxy/whatsapp/{phoneNumber}/group/participants/remove
POST /proxy/whatsapp/{phoneNumber}/group/leave
POST /proxy/whatsapp/{phoneNumber}/group/photo
POST /proxy/whatsapp/{phoneNumber}/group/name
# + 11 more group endpoints
```

## Examples

### Send Message via Proxy
```bash
# Send text message
curl -X POST http://localhost:3000/proxy/whatsapp/send/message \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511888888888@s.whatsapp.net",
    "message": "Hello from proxy!"
  }'

# Get user info
curl -X GET "http://localhost:3000/proxy/whatsapp/5511999999999/user/info?phone=5511888888888@s.whatsapp.net" \
  -H "Authorization: Bearer <token>"

# Login to WhatsApp
curl -X GET http://localhost:3000/proxy/whatsapp/5511999999999/app/login \
  -H "Authorization: Bearer <token>"
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