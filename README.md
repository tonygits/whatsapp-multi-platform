# 🚀 WhatsApp Multi-Platform

> Plataforma escalável para gerenciar múltiplos números de WhatsApp utilizando containers Docker

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-20+-blue.svg)](https://docker.com/)
[![Go](https://img.shields.io/badge/Go-1.21+-blue.svg)](https://golang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 📋 Visão Geral

A **WhatsApp Multi-Platform** é uma solução robusta e escalável que permite gerenciar múltiplos números de WhatsApp simultaneamente através de containers Docker isolados. Cada instância do WhatsApp roda em seu próprio container com sessão persistente, garantindo isolamento completo e máxima disponibilidade.

### 🌟 Características Principais

- ✅ **Múltiplos números simultâneos** - Gerenciamento ilimitado de instâncias WhatsApp
- ✅ **Isolamento completo** - Cada número em container Docker separado
- ✅ **Sessões persistentes** - Volumes dedicados para cada instância
- ✅ **API RESTful completa** - Endpoints para todas as operações
- ✅ **WebSocket em tempo real** - Notificações instantâneas de eventos
- ✅ **Sistema de filas inteligente** - Controle de concorrência por número
- ✅ **Autenticação JWT** - Segurança robusta com controle de acesso
- ✅ **Monitoramento avançado** - Health checks e métricas detalhadas
- ✅ **Auto-scaling** - Provisionamento automático de containers
- ✅ **QR Code dinâmico** - Reautenticação automática via WebSocket
- ✅ **Backup automático** - Scripts de backup e restauração
- ✅ **Auto-updates** - Verificação inteligente de atualizações

## 🏗️ Arquitetura

> 🔄 **Nova Arquitetura de Proxy:** Agora usamos a [imagem oficial](https://hub.docker.com/r/aldinokemal2104/go-whatsapp-web-multidevice) do go-whatsapp-web-multidevice como containers de backend, com nossa API Gateway funcionando como um proxy inteligente. Veja [PROXY_ARCHITECTURE.md](docs/PROXY_ARCHITECTURE.md) para detalhes completos.

## 🏗️ Arquitetura

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│     Nginx       │    │   API Gateway    │    │  Container Oficial  │
│   (Proxy/LB)    │◄──►│  (Proxy + Filas) │◄──►│  go-whatsapp-web    │
│   Port 80/443   │    │    Port 3000     │    │   Port 4000-4999    │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
         │                       │                         │
         │                       ▼                         │
         │              ┌─────────────────┐                │
         │              │ • Auth & JWT    │                │
         │              │ • Smart Proxy   │                │
         │              │ • Queue System  │                │
         │              │ • Multi-tenant  │                │
         │              │ • Monitoring    │                │
         │              └─────────────────┘                │
         │                       │                         │
         ▼                       ▼                         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Config Files  │    │   Docker Engine  │    │   Session Volumes   │
│ (whatsapp.db)   │    │                  │    │  (SQLite + Keys)    │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

## 🚀 Início Rápido

### 1️⃣ Pré-requisitos

- **Docker** 20.10+
- **Docker Compose** 2.0+
- **Node.js** 18+ (para desenvolvimento)
- **4GB RAM** mínimo
- **20GB** espaço em disco

### 2️⃣ Instalação

```bash
# Clone o repositório
git clone https://github.com/your-repo/whatsapp-multi-platform.git
cd whatsapp-multi-platform

# Torne os scripts executáveis
chmod +x scripts/*.sh scripts/maintenance/*.sh

# Inicie a plataforma
./scripts/start.sh
```

### 3️⃣ Configuração Inicial

```bash
# Copie o arquivo de ambiente
cp .env.example .env

# Edite as configurações (IMPORTANTE!)
nano .env
```

**Variáveis essenciais:**
```env
API_PORT=3000
JWT_SECRET=seu_jwt_secret_super_seguro_aqui
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASS=sua_senha_segura_aqui
```

### 4️⃣ Primeiro Acesso

1. **API Gateway**: http://localhost:3000
2. **Login**: `POST /api/auth/login`
3. **Registrar dispositivo**: `POST /api/devices`
4. **Obter QR Code**: `GET /api/devices/{numero}/qr`

## 📖 Documentação

- 📚 [**Documentação Completa da API**](docs/API_DOCUMENTATION.md)
- 🔧 [**Guia de Instalação Detalhado**](docs/INSTALLATION.md)
- 🛠️ [**Configuração Avançada**](docs/CONFIGURATION.md)
- 🔍 [**Troubleshooting**](docs/TROUBLESHOOTING.md)

## 💡 Exemplos de Uso

### Registrar um Novo Número

```bash
# 1. Fazer login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"sua_senha"}'

# 2. Registrar número
curl -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer <seu_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "5511999999999",
    "name": "Atendimento Principal"
  }'

# 3. Obter QR Code
curl -X GET http://localhost:3000/api/devices/5511999999999/qr \
  -H "Authorization: Bearer <seu_token>"
```

### Enviar Mensagem

```bash
# Via API tradicional (nossa interface)
curl -X POST http://localhost:3000/api/messages/send \
  -H "Authorization: Bearer <seu_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "5511999999999",
    "to": "5511888888888",
    "message": "Olá! Como posso ajudar?"
  }'

# OU via proxy direto (API oficial)
curl -X POST http://localhost:3000/proxy/whatsapp/send/message \
  -H "Authorization: Bearer <seu_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+5511888888888@s.whatsapp.net",
    "message": "Mensagem via proxy!"
  }'
```

### WebSocket (JavaScript)

```javascript
const socket = io('http://localhost:3000');

// Entrar na sala do dispositivo
socket.emit('join-device', '5511999999999');

// Escutar QR Code
socket.on('qr-code', (data) => {
  console.log('QR Code:', data.qrImage);
  // Exibir QR Code para escaneamento
});

// Escutar autenticação
socket.on('auth-success', (data) => {
  console.log('WhatsApp conectado!', data.phoneNumber);
});
```

## 🛠️ Scripts de Manutenção

### Backup Automático

```bash
# Backup completo
./scripts/maintenance/backup.sh

# Backup é salvo em ./backups/
```

### Limpeza do Sistema

```bash
# Limpeza automática
./scripts/maintenance/cleanup.sh

# Remove containers antigos, logs, cache, etc.
```

### Monitoramento

```bash
# Status geral
curl http://localhost:3000/api/health/detailed

# Status dos dispositivos
curl http://localhost:3000/api/health/devices

# Métricas do sistema
curl http://localhost:3000/api/health/system
```

## 📊 Monitoramento e Logs

### Visualizar Logs

```bash
# Todos os serviços
docker-compose logs -f

# Apenas API Gateway
docker-compose logs -f api-gateway

# Container específico
docker logs whatsapp-5511999999999
```

### Métricas Importantes

- **Taxa de entrega**: Percentual de mensagens entregues com sucesso
- **Tempo de resposta**: Latência média da API
- **Containers ativos**: Número de instâncias WhatsApp rodando
- **Filas ativas**: Mensagens pendentes por dispositivo
- **Uso de recursos**: CPU, memória e disco

## 🔧 Configuração Avançada

### Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|---------|
| `API_PORT` | Porta da API Gateway | `3000` |
| `CONTAINER_BASE_PORT` | Porta inicial dos containers | `4000` |
| `MAX_CONTAINERS` | Máximo de containers | `50` |
| `QR_CODE_TIMEOUT` | Timeout do QR Code (ms) | `60000` |
| `UPDATE_CHECK_CRON` | Cron para verificar updates | `0 2 * * *` |
| `API_RATE_LIMIT` | Limite de requisições | `100` |

### Personalização

```javascript
// Configurar filas personalizadas
const customQueue = {
  concurrency: 2,
  interval: 500,
  intervalCap: 1
};

// Configurar timeouts
const timeouts = {
  container: 30000,
  message: 25000,
  qr: 60000
};
```

## 🤝 Contribuição

Contribuições são bem-vindas! Por favor:

1. Faça um **Fork** do projeto
2. Crie uma **branch** para sua feature (`git checkout -b feature/AmazingFeature`)
3. **Commit** suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. **Push** para a branch (`git push origin feature/AmazingFeature`)
5. Abra um **Pull Request**

## 📝 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🆘 Suporte

- 📖 [Documentação](docs/)
- 🐛 [Issues](https://github.com/your-repo/issues)
- 💬 [Discussions](https://github.com/your-repo/discussions)
- 📧 Email: suporte@whatsapp-platform.com

## 🎯 Roadmap

Veja nosso [roadmap completo](ROADMAP.md) com próximas features planejadas.

---

<div align="center">

**⭐ Se este projeto foi útil, considere dar uma estrela!**

Feito com ❤️ para a comunidade

</div>