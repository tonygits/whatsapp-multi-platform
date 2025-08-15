# 🔧 Variáveis de Ambiente

## 📋 Lista Completa das Variáveis

### 🚀 API Gateway
| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `NODE_ENV` | `production` | Ambiente de execução (development/production) |
| `API_PORT` | `3000` | Porta do API Gateway |
| `API_RATE_LIMIT` | `100` | Limite de requisições por minuto |
| `API_AUTH_ENABLED` | `true` | Habilita/desabilita autenticação básica |

### 🔐 Autenticação
| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `DEFAULT_ADMIN_USER` | `admin` | Usuário padrão para autenticação |
| `DEFAULT_ADMIN_PASS` | `admin` | Senha padrão para autenticação |

### 🐳 Docker
| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Path para o socket do Docker |

### 📝 Logging
| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `LOG_LEVEL` | `info` | Nível de log (error/warn/info/debug) |
| `LOGS_PATH` | `./logs` | Diretório para arquivos de log |

### 🔄 Update Manager
| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `UPDATE_CHECK_CRON` | `'0 2 * * *'` | Schedule para verificar atualizações |
| `AUTO_UPDATE_ENABLED` | `true` | Habilita atualizações automáticas |

### 🏥 Health & Monitoring
| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `HEALTH_CHECK_INTERVAL` | `30000` | Intervalo de health check em ms |
| `MASK_PHONE_NUMBERS` | `true` | Mascarar números de telefone nos logs |

### 📁 Paths (Opcional)
| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `APP_BASE_DIR` | `/app` (Docker) | Diretório base da aplicação |

## 📄 Arquivo .env.example

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

## 🎯 Variáveis por Uso

### 🚨 **Obrigatórias em Produção**
- `DEFAULT_ADMIN_USER` - Definir usuário seguro
- `DEFAULT_ADMIN_PASS` - Definir senha forte
- `NODE_ENV=production` - Para otimização
- `LOG_LEVEL=warn` ou `error` - Reduzir logs

### 🔧 **Customização Comum**
- `API_PORT` - Se porta 3000 conflitar
- `LOGS_PATH` - Para logs centralizados
- `HEALTH_CHECK_INTERVAL` - Ajustar frequência
- `API_RATE_LIMIT` - Ajustar conforme carga

### 🔄 **Desenvolvimento**
- `NODE_ENV=development` - Para debugging
- `LOG_LEVEL=debug` - Logs detalhados
- `API_AUTH_ENABLED=false` - Facilitar testes

## ⚠️ Considerações de Segurança

1. **Nunca** commitar arquivo `.env` com credenciais reais
2. **Sempre** alterar `DEFAULT_ADMIN_PASS` em produção
3. **Use** senhas fortes para admin
4. **Configure** `MASK_PHONE_NUMBERS=true` para privacidade
5. **Ajuste** `LOG_LEVEL` para evitar vazamento de dados sensíveis

## 📚 Referências

- Arquivo de exemplo: [.env.example](../.env.example)
- Configuração Docker: [docker-compose.yml](../docker-compose.yml)
- Documentação principal: [CLAUDE.md](../CLAUDE.md)

---

*Documentação atualizada - Todas as variáveis verificadas no código*