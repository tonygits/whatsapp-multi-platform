
# 📚 WhatsApp Multi-Platform API Gateway Documentation

## 📋 Documentation Index

### 🚀 Getting Started
- **[GETTING_STARTED.md](./GETTING_STARTED.md)** - Quick start guide for new users

### 🏗️ Architecture and Concepts
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System technical architecture
- **[DEVICE_SECURITY.md](./DEVICE_SECURITY.md)** - Security and deviceHash identification
- **[ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)** - Complete environment variables

### 🔄 APIs and Integrations
- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - Complete API documentation
- **[WEBHOOK_STATUS.md](./WEBHOOK_STATUS.md)** - Status webhook system
- **[openapi.yaml](./openapi.yaml)** - OpenAPI/Swagger specification
- **[openapi.json](./openapi.json)** - OpenAPI specification (JSON)

### 🐳 Deployment and Infrastructure
- **[DOCKER_DEPLOY.md](./DOCKER_DEPLOY.md)** - Automatic deployment to Docker Hub
- **[DOCKER_HUB_SETUP.md](./DOCKER_HUB_SETUP.md)** - GitHub Actions configuration

## 🚀 Links Fast

### Available APIs
- **Swagger UI**: `http://localhost:3000/docs`
- **OpenAPI YAML**: `http://localhost:3000/docs/openapi.yaml`
- **Health Check**: `http://localhost:3000/api/health`

### Main Endpoints

```bash
# Register device
POST /api/devices

# Get QR code
GET /api/login
Header: x-instance-id: {deviceHash}

# Send message
POST /api/send/message
Header: x-instance-id: {deviceHash}
```

## 📁 Project Structure

```
docs/
├── README.md                   # This file (index)
├── GETTING_STARTED.md          # Getting started guide
├── API_DOCUMENTATION.md        # API docs
├── ARCHITECTURE.md             # Technical architecture
├── DEVICE_SECURITY.md          # Security deviceHash
├── WEBHOOK_STATUS.md           # Webhook system
├── DOCKER_DEPLOY.md            # Deploy Docker Hub
├── DOCKER_HUB_SETUP.md         # Setup GitHub Actions
├── openapi.yaml                # OpenAPI specification
└── openapi.json                # OpenAPI Specification (JSON)
```

## 📖 How to Use This Documentation

1. **New Users**: Start with [GETTING_STARTED.md](./GETTING_STARTED.md)
2. **Developers**: Go directly to [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
3. **DevOps**: Check [DOCKER_DEPLOY.md](./DOCKER_DEPLOY.md)
4. **Security**: Read [DEVICE_SECURITY.md](./DEVICE_SECURITY.md)

---

*Organized and centralized documentation - WhatsApp Multi-Platform API Gateway Project*
