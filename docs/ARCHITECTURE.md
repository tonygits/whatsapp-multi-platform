# Architecture

## Overview

Wapflow Platform uses an intelligent proxy architecture to manage multiple WhatsApp Phone Numbers.

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

### WhatsApp Processes
- **Official binary**: `wapflow-multidevice`
- **Isolated** per device
- **Dynamic port** allocation
- **Health monitoring**

### API Routes
Direct access to device APIs:
```
/api/{endpoint} + deviceHash: numberHash → Process:port/{endpoint}
```

## Security Features

### Phone Number Hash
- Public identifier for phone numbers
- No phone numbers in URLs
- Generated automatically

### Device Identification
- **All environments**: numberHash only
- **No phone data exposure**: Privacy by design
- **Consistent**: Same identifier across all logs and APIs

## Database Schema

```sql
devices:
  - id (primary)
  - device_hash (unique)
  - phone_number(unique)
  - status
  - container_port
  - webhook_url
  - status_webhook_url
  - created_at
```

## Process Management

1. **Register**: Create device with auto-generated deviceHash
2. **Start**: Launch WhatsApp process on dynamic port
3. **Monitor**: Health checks + auto-restart
4. **Stop**: Graceful shutdown
5. **Remove**: Cleanup resources
