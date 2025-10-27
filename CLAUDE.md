# 🤖 CLAUDE.md

## 📋 Project: WhatsApp Multi-Platform API Gateway

### 🎯 Overview
A scalable system for managing multiple WhatsApp devices through an API Gateway with isolated processes and deviceHash identification.

### 🏗️ Current Architecture
- **API Gateway**: Node.js/Express running on port 3000 (direct access)
- **WhatsApp Processes**: `go-whatsapp-web-multidevice` binary on dynamic ports (8000+)
- **Identification**: 16-character hexadecimal deviceHash (auto-generated)
- **Database**: SQLite for persistence
- **Sessions**: Persistent volumes per deviceHash
- **Deploy**: GitHub Actions with multi-architecture build for Docker Hub

### 🔑 Device Identification
- **System**: Based on `deviceHash` (e.g., `a1b2c3d4e5f67890`)
- **Generation**: `crypto.randomBytes(8).toString('hex')`
- **Headers**: `deviceHash` to identify the device in APIs
- **Privacy**: Zero exposure of personal data (phoneNumber removed)

### 📁 Main Code Structure

#### Core Services
- `src/services/newDeviceManager.js` - Device Management
- `src/services/binaryManager.js` - WhatsApp Process Management
- `src/services/statusWebhookManager.js` - Webhook System
- `src/services/updateManager.js` - Update Checks

#### Repositories & Database
- `src/repositories/DeviceRepository.js` - SQLite Database Access
- `src/database/database.js` - SQLite Connection and Schema

#### Routes & API (Consolidated)
- `src/routes/proxy.js` - **CONSOLIDATED** - All 52 proxy endpoints
- `src/routes/devices.js` - Device CRUD
- `src/routes/health.js` - Health Checks
- `src/routes/docs.js` - Documentation

#### Middleware (Optimized)
- `src/middleware/proxyToActiveDevice.js` - **SOLE** proxy middleware (consolidated)
- `src/middleware/loginHandler.js` - QR code interception
- `src/middleware/auth.js` - Basic authentication

#### Utils
- `src/utils/deviceUtils.js` - DeviceHash utilities
- `src/utils/paths.js` - Path management (Docker/Local)
- `src/utils/logger.js` - Logging system

### 🔄 Naming Conventions
- **Application**: camelCase(`deviceHash`, `webhookUrl`)
- **Database**: snake_case(`device_hash`, (`webhook_url`)
- **Automatic conversion**: Repository layer performs mapping

### 🚀 Core APIs

#### Device Registration
```bash
POST /api/devices
{
"webhookUrl": "https://mysite.com/webhook",
"statusWebhookUrl": "https://mysite.com/status"
}
# Returns: { deviceHash: "a1b2c3d4e5f67890", status: "registered" }
```

#### Device Operations
```bash
# All use header: deviceHash: a1b2c3d4e5f67890
GET /api/devices/info # Device information
POST /api/devices/start # Start process
POST /api/devices/stop # Stop process
DELETE /api/devices # Remove device
GET /api/login # Get QR code
```

#### Sending Messages
```bash
POST /api/send/message
x-instance-id: a1b2c3d4e5f67890
{
  "phone": "+5511999999999@s.whatsapp.net",
  "message": "Hello World"
}
```

### 📦 Process System

#### Initiation
1. DeviceHash automatically generated
2. Dynamic port allocated (8000+)
3. WhatsApp process started
4. WebSocket connected
5. Health monitoring enabled

#### Management
- **Isolation**: Each deviceHash = separate process
- **Sessions**: Persisted in `sessions/{deviceHash}/`
- **Volumes**: Individual SQLite per process
- **Auto-restart**: Existing sessions are resumed

### 🔐 Webhooks de Status

#### Settings
```json
{
  "device": {
    "deviceHash": "a1b2c3d4e5f67890",
    "status": "connected"
  },
  "event": {
    "type": "login_success",
    "code": "LOGIN_SUCCESS",
    "message": "Device connected successfully"
  },
  "timestamp": "2025-08-12T15:30:45.123Z"
}
```

#### Events
- `login_success` - Login successful
- `connected` - Connected device
- `disconnected` - Disconnected device
- `auth_failed` - Authentication failure
- `container_event` - Process events

### 🛠️ Development

#### Useful Commands
```bash
# Start server
npm start

# Development with hot-reload
npm run dev

# Testing
npm test

# Lint and format
npm run lint
npm run format

# Complete system cleanup
./scripts/maintenance/cleanup.sh
```

#### Debugging
- **Logs**: Console + arquivo (winston)
- **Health**: GET /api/health
- **Diagnostics**: GET /api/health/detailed

### 🔧 Configuration

#### Environment Variables
```bash
# API Gateway
API_PORT=3000
NODE_ENV=production
API_RATE_LIMIT=100
API_AUTH_ENABLED=true

# Authentication
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASS=admin

# Docker
DOCKER_SOCKET=/var/run/docker.sock

# Logging
LOG_LEVEL=info
LOGS_PATH=./logs

# Update Manager
UPDATE_CHECK_CRON='0 2 * * *'
AUTO_UPDATE_ENABLED=true

# Health & Monitoring
HEALTH_CHECK_INTERVAL=30000
MASK_PHONE_NUMBERS=true

# Paths (opcional)
APP_BASE_DIR=/custom/path
```

#### File Structure
```
/
├── api-gateway/
│   ├── src/
│   │   ├── services/      # Core business logic
│   │   ├── routes/        # API endpoints
│   │   ├── middleware/    # Express middleware
│   │   ├── repositories/  # Data access
│   │   ├── database/      # SQLite setup
│   │   └── utils/         # Utilities
│   └── server.js          # Entry point
├── docs/                  # Documentação centralizada
│   ├── README.md          # Índice da documentação
│   ├── ENVIRONMENT_VARIABLES.md  # Variáveis completas
│   └── *.md              # Outras documentações
├── scripts/
│   └── maintenance/       # Scripts de manutenção
│       └── cleanup.sh     # Limpeza completa do sistema
├── .github/
│   └── workflows/         # GitHub Actions
│       ├── docker-build-push.yml  # Deploy Docker Hub
│       └── release.yml    # Releases automáticos
├── sessions/              # Device sessions (gitignored)
├── volumes/              # SQLite databases (gitignored)
├── whatsapp              # WhatsApp binary
└── README.md             # Documentação principal
```

### 📊 Bank Schema

```sql
CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_hash VARCHAR(16) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'registered',
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  container_id VARCHAR(100),
  container_port INTEGER,
  webhook_url TEXT,
  webhook_secret TEXT,
  status_webhook_url TEXT,
  status_webhook_secret TEXT,
  last_seen DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 🚨 Known Issues and Solutions

#### Server won't start
- **Symptom**: Process dies after startup logs
- **Cause**: Incorrect startup order
- **Solution**: Database must be initialized before managers

#### QR codes don't appear outside of Docker
- **Problem**: Hardcoded path to `/app/sessions`
- **Solution**: Use `SESSIONS_DIR` from `paths.js`
- **Status**: ✅ Fixed

#### Old references to phoneNumber
- **Problem**: Traces of phoneNumber in code/docs
- **Solution**: Complete refactoring to deviceHash
- **Status**: ✅ Complete

### 🔄 Recent Refactoring (Completed)

#### Major Changes
1. **Complete removal of phoneNumber/name**
2. **Introduction of auto-generated deviceHash**
3. **APIs using deviceHash headers**
4. **CamelCase/snake_case conventions**
5. **Duplicate method cleanup**
6. **Updated documentation**

#### Before vs After
```bash
# ANTES
POST /api/devices { "phoneNumber": "5511999999999", "name": "Device" }
GET /api/devices/5511999999999/qr

# DEPOIS  
POST /api/devices { "webhookUrl": "https://..." }
GET /api/login + header deviceHash: a1b2c3d4e5f67890
```

### 📝 Tasks Completed

#### 🔄 Major Refactoring (Completed)
1. ✅ DeviceHash auto-generation
2. ✅ Removal of phoneNumber/name from the API
3. ✅ Implemented deviceHash headers
4. ✅ Standardized naming conventions
5. ✅ Duplicate code cleanup
6. ✅ Fixed QR code path for non-Docker environments

#### 📚 Documentation Organization (Recent)
1. ✅ Centralized documentation in the `docs/` folder
2. ✅ Creation of `docs/README.md` as an index
3. ✅ Complete documentation of environment variables
4. ✅ Fixed inconsistencies in `.env.example`
5. ✅ Updated the main README

#### 🏗️ Architecture Simplification (Recent)
1. ✅ Nginx Removal (Simplified Architecture)
2. ✅ Direct Access to Port 3000
3. ✅ Cleanup Script Consolidation
4. ✅ Docker-compose.yml Update

#### 🚀 Deployment and CI/CD (Recent)
1. ✅ GitHub Actions for Docker builds
2. ✅ Automatic deployment to Docker Hub
3. ✅ Multi-architecture build (amd64/arm64)
4. ✅ Automatic release workflow
5. ✅ Complete deployment documentation

#### 🗂️ Radical Route Consolidation (Current)
1. ✅ Consolidation of 8 route files into 1
2. ✅ Reduction of 3 middleware files to 1 optimized one
3. ✅ 52 endpoints consolidated in proxy.js
4. ✅ Unified proxyToActiveDevice middleware
5. ✅ 75% simplification of route code
6. ✅ Improved performance and maintainability

### 🎯 Suggested Next Steps
1. Implement rate limiting by deviceHash
2. Add usage metrics per device
3. Automatic session backup system
4. Web dashboard for monitoring
5. Complete automated testing
6. Advanced monitoring with custom metrics
7. Load balancing for multiple instances

### 🔗 Useful Links
- **API Docs**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/api/health
- **OpenAPI**: http://localhost:3000/docs/openapi.yaml
- **Documentation**: [docs/README.md](docs/README.md)
- **Environment Variables**: [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)
- **Deploy Docker**: [docs/DOCKER_DEPLOY.md](docs/DOCKER_DEPLOY.md)

---

*Last updated: August 2025*

**Current project status**: Highly optimized and ready for release ✅
- 🏗️ Simplified architecture (no Nginx)
- 📚 Centralized documentation focused on new users
- 🚀 Automatic deployment configured with GitHub Actions
- 🧹 Consolidated cleaning system
- 🔧 Documented environment variables
- 🗂️ **NEW:** Consolidated routes (8→1 file, 75% less code)
- 📦 **NEW:** Unified middleware for better performance

*This document is kept automatically updated by Claude*
