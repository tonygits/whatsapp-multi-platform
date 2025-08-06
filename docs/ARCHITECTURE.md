# Architecture

## Overview

WhatsApp Multi-Platform usa uma arquitetura de proxy inteligente para gerenciar múltiplos dispositivos WhatsApp.

## Components

```
Client → API Gateway → WhatsApp Containers
  ↓         ↓              ↓
Auth     Queues       Official Library
```

### API Gateway
- **Node.js** server com Express
- **JWT** authentication
- **SQLite** database
- **Message queuing** system
- **Container management**

### WhatsApp Containers
- **Official image**: `aldinokemal2104/go-whatsapp-web-multidevice`
- **Isolated** per phone number
- **Dynamic port** allocation
- **Health monitoring**

### Proxy Routes
Direct access to container APIs:
```
/proxy/whatsapp/{phoneNumber}/* → Container:port/*
```

## Security Features

### Device Hash
- Public identifier for devices
- No phone numbers in URLs
- Generated automatically

### Phone Number Masking
- **Development**: Full numbers for debugging
- **Production**: Masked numbers (`5511*****9999`)
- **Debug logs**: Always full numbers

## Database Schema

```sql
devices:
  - id (primary)
  - device_hash (unique)
  - phone_number
  - phone_hash
  - status
  - container_port
```

## Container Management

1. **Register**: Create device + container
2. **Start**: Launch container on dynamic port
3. **Monitor**: Health checks + auto-restart
4. **Stop**: Graceful shutdown
5. **Remove**: Cleanup resources