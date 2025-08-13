# 🤖 CLAUDE.md

## 📋 Projeto: WhatsApp Multi-Platform API Gateway

### 🎯 Visão Geral
Sistema escalável para gerenciar múltiplos dispositivos WhatsApp através de uma API Gateway com processos isolados e identificação por deviceHash.

### 🏗️ Arquitetura Atual
- **API Gateway**: Node.js/Express rodando na porta 3000
- **Processos WhatsApp**: Binário `go-whatsapp-web-multidevice` em portas dinâmicas (8000+)
- **Identificação**: deviceHash hexadecimal de 16 caracteres (auto-gerado)
- **Banco de dados**: SQLite para persistência
- **Sessões**: Volumes persistentes por deviceHash

### 🔑 Identificação de Dispositivos
- **Sistema**: Baseado em `deviceHash` (ex: `a1b2c3d4e5f67890`)
- **Geração**: `crypto.randomBytes(8).toString('hex')`
- **Headers**: `x-instance-id` para identificar dispositivo nas APIs
- **Privacy**: Zero exposição de dados pessoais (phoneNumber removido)

### 📁 Estrutura de Código Principal

#### Core Services
- `src/services/newDeviceManager.js` - Gerenciamento de dispositivos
- `src/services/binaryManager.js` - Gerenciamento de processos WhatsApp
- `src/services/statusWebhookManager.js` - Sistema de webhooks
- `src/services/updateManager.js` - Verificações de atualização

#### Repositories & Database
- `src/repositories/DeviceRepository.js` - Acesso ao banco SQLite
- `src/database/database.js` - Conexão e schema SQLite

#### Routes & API
- `src/routes/devices.js` - CRUD de dispositivos
- `src/routes/app.js` - Proxy para endpoints /app/*
- `src/routes/send.js` - Proxy para endpoints /send/*
- `src/routes/user.js` - Proxy para endpoints /user/*
- `src/routes/message.js` - Proxy para endpoints /message/*
- `src/routes/chat.js` - Proxy para endpoints /chat/*
- `src/routes/group.js` - Proxy para endpoints /group/*
- `src/routes/health.js` - Health checks

#### Middleware
- `src/middleware/resolveInstance.js` - Resolução de deviceHash
- `src/middleware/loginHandler.js` - Interceptação de QR codes
- `src/middleware/auth.js` - Autenticação básica

#### Utils
- `src/utils/deviceUtils.js` - Utilitários de deviceHash
- `src/utils/paths.js` - Gerenciamento de caminhos (Docker/Local)
- `src/utils/logger.js` - Sistema de logs

### 🔄 Convenções de Nomenclatura
- **Aplicação**: camelCase (`deviceHash`, `webhookUrl`)
- **Banco de dados**: snake_case (`device_hash`, `webhook_url`)
- **Conversão automática**: Repository layer faz mapeamento

### 🚀 APIs Principais

#### Registro de Dispositivo
```bash
POST /api/devices
{
  "webhookUrl": "https://meusite.com/webhook",
  "statusWebhookUrl": "https://meusite.com/status"
}
# Retorna: { deviceHash: "a1b2c3d4e5f67890", status: "registered" }
```

#### Operações de Dispositivo
```bash
# Todas usam header: x-instance-id: a1b2c3d4e5f67890
GET /api/devices/info          # Informações do dispositivo
POST /api/devices/start        # Iniciar processo
POST /api/devices/stop         # Parar processo
DELETE /api/devices           # Remover dispositivo
GET /api/login                # Obter QR code
```

#### Envio de Mensagens
```bash
POST /api/send/message
x-instance-id: a1b2c3d4e5f67890
{
  "phone": "+5511999999999@s.whatsapp.net",
  "message": "Hello World"
}
```

### 📦 Sistema de Processos

#### Iniciação
1. DeviceHash gerado automaticamente
2. Porta dinâmica alocada (8000+)
3. Processo WhatsApp iniciado
4. WebSocket conectado
5. Health monitoring ativado

#### Gerenciamento
- **Isolamento**: Cada deviceHash = processo separado
- **Sessões**: Persistidas em `sessions/{deviceHash}/`
- **Volumes**: SQLite individual por processo
- **Auto-restart**: Sessões existentes são retomadas

### 🔐 Webhooks de Status

#### Configuração
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

#### Eventos
- `login_success` - Login realizado
- `connected` - Dispositivo conectado
- `disconnected` - Dispositivo desconectado
- `auth_failed` - Falha de autenticação
- `container_event` - Eventos do processo

### 🛠️ Desenvolvimento

#### Comandos Úteis
```bash
# Iniciar servidor
npm start

# Desenvolvimento com hot-reload
npm run dev

# Testes
npm test

# Lint e format
npm run lint
npm run format
```

#### Debugging
- **Logs**: Console + arquivo (winston)
- **Health**: GET /api/health
- **Diagnostics**: GET /api/health/detailed

### 🔧 Configuração

#### Variáveis de Ambiente
```bash
# Servidor
API_PORT=3000
NODE_ENV=development

# Autenticação
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASS=admin

# Processos
PROCESS_BASE_PORT=8000
MAX_PROCESSES=50

# Health checks
HEALTH_CHECK_INTERVAL=30000
```

#### Estrutura de Arquivos
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
├── sessions/              # Device sessions
├── volumes/              # SQLite databases
├── whatsapp              # WhatsApp binary
└── docs/                 # Documentation
```

### 📊 Schema do Banco

```sql
CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_hash VARCHAR(16) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'registered',
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

### 🚨 Problemas Conhecidos e Soluções

#### Server não inicia
- **Sintoma**: Processo morre após logs de inicialização
- **Causa**: Ordem de inicialização incorreta
- **Solução**: Database deve ser inicializado antes dos managers

#### QR codes não aparecem fora do Docker
- **Problema**: Path hardcoded para `/app/sessions`
- **Solução**: Usar `SESSIONS_DIR` do `paths.js`
- **Status**: ✅ Corrigido

#### Referências antigas a phoneNumber
- **Problema**: Vestígios de phoneNumber em código/docs
- **Solução**: Refatoração completa para deviceHash
- **Status**: ✅ Concluído

### 🔄 Refatoração Recente (Concluída)

#### Principais Mudanças
1. **Remoção completa de phoneNumber/name**
2. **Introdução de deviceHash auto-gerado**
3. **APIs usando headers x-instance-id**
4. **Convenções camelCase/snake_case**
5. **Limpeza de métodos duplicados**
6. **Documentação atualizada**

#### Antes vs Depois
```bash
# ANTES
POST /api/devices { "phoneNumber": "5511999999999", "name": "Device" }
GET /api/devices/5511999999999/qr

# DEPOIS  
POST /api/devices { "webhookUrl": "https://..." }
GET /api/login + header x-instance-id: a1b2c3d4e5f67890
```

### 📝 Tasks Executadas
1. ✅ Auto-geração de deviceHash
2. ✅ Remoção de phoneNumber/name da API
3. ✅ Headers x-instance-id implementados
4. ✅ Convenções de nomenclatura padronizadas
5. ✅ Limpeza de código duplicado
6. ✅ Documentação completamente atualizada
7. ✅ QR code path corrigido para ambientes não-Docker

### 🎯 Próximos Passos Sugeridos
1. **Implementar rate limiting** por deviceHash
2. **Adicionar métricas** de uso por dispositivo
3. **Sistema de backup** automático das sessões
4. **Dashboard web** para monitoramento
5. **Testes automatizados** completos

### 🔗 Links Úteis
- **API Docs**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/api/health
- **OpenAPI**: http://localhost:3000/docs/openapi.yaml

---

*Este documento foi gerado automaticamente pelo Claude e reflete o estado atual do projeto após a refatoração completa.*