# 🔧 Environment Variables

## 📋 Complete List of Variables

### 🚀 API Gateway
| Variable | Standard | Description |
|----------|--------|-----------|
| `NODE_ENV` | `production` | Execution environment (development/production)|
| `API_PORT` | `3000` | API Gateway port|
| `API_RATE_LIMIT` | `100` | Request limit per minute|
| `API_AUTH_ENABLED` | `true` | Enables/disables basic authentication|

### 🔐 Authentication
| Variable | Standard | Description |
|----------|--------|-----------|
| `DEFAULT_ADMIN_USER` | `admin` | Default user for authentication |
| `DEFAULT_ADMIN_PASS` | `admin` | Default password for authentication|

### 🐳 Docker
| Variable | Standard | Description |
|----------|--------|-------------|
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Path to Docker socket |

### 📝 Logging
| Variable | Standard | Description             |
|----------|--------|-------------------------|
| `LOG_LEVEL` | `info` | Log level (error/warn/info/debug) |
| `LOGS_PATH` | `./logs` | Directory for log files |

### 🔄 Update Manager
| Variable | Standard | Description |
|----------|--------|-------------|
| `UPDATE_CHECK_CRON` | `'0 2 * * *'` | Schedule to check for updates |
| `AUTO_UPDATE_ENABLED` | `true` | Enables automatic updates |

### 🏥 Health & Monitoring
| Variable | Standard | Description                |
|----------|--------|----------------------------|
| `HEALTH_CHECK_INTERVAL` | `30000` | Health check interval in ms |
| `MASK_PHONE_NUMBERS` | `true` | Mask phone numbers in logs |

### 📁 Paths (Opcional)
| Variable | Standard | Description |
|----------|--------|-----------|
| `APP_BASE_DIR` | `/app` (Docker) | Application base directory |

## 📄 .env.example file

```bash
# WhatsApp Multi-Platform Environment Configuration

# =========================
# API GATEWAY SETTINGS
# =========================
NODE_ENV=production
API_PORT=3000
API_RATE_LIMIT=100

# =========================
# AUTHENTICATION
# =========================
API_AUTH_ENABLED=true
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASS=admin

# =========================
# DOCKER SETTINGS
# =========================
DOCKER_SOCKET=/var/run/docker.sock

# =========================
# PATHS
# =========================
LOGS_PATH=./logs

# =========================
# LOGGING
# =========================
LOG_LEVEL=info

# =========================
# UPDATE MANAGER
# =========================
UPDATE_CHECK_CRON='0 2 * * *'
AUTO_UPDATE_ENABLED=true

# =========================
# OTHER
# =========================
MASK_PHONE_NUMBERS=true
HEALTH_CHECK_INTERVAL=30000
```

## 🎯 Variables for Use

### 🚨 **Required in Production**
- `DEFAULT_ADMIN_USER` - Set a secure user
- `DEFAULT_ADMIN_PASS` - Set a strong password
- `NODE_ENV=production` - For optimization
- `LOG_LEVEL=warn` or `error` - Reduce logs

### 🔧 **Common Customization**
- `API_PORT` - If port 3000 conflicts
- `LOGS_PATH` - For centralized logging
- `HEALTH_CHECK_INTERVAL` - Adjust frequency
- `API_RATE_LIMIT` - Adjust according to load

### 🔄 **Development**
- `NODE_ENV=development` - For debugging
- `LOG_LEVEL=debug` - Detailed logs
- `API_AUTH_ENABLED=false` - Facilitate testing

## ⚠️ Security Considerations

1. **Never** commit a `.env` file with real credentials
2. **Always** change `DEFAULT_ADMIN_PASS` in production
3. **Use** strong passwords for admin
4. **Set** `MASK_PHONE_NUMBERS=true` for privacy
5. **Adjust** `LOG_LEVEL` to prevent sensitive data leaks

## 📚 References

- Example file: [.env.example](../.env.example)
- Docker configuration: [docker-compose.yml](../docker-compose.yml)
- Main documentation: [CLAUDE.md](../CLAUDE.md)

---

*Updated documentation - All variables checked in the code*
