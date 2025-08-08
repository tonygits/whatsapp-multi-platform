# 🚀 WhatsApp Multi-Platform

> Plataforma escalável para gerenciar múltiplos números de WhatsApp utilizando containers Docker

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-20+-blue.svg)](https://docker.com/)
[![Go](https://img.shields.io/badge/Go-1.21+-blue.svg)](https://golang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 📋 Visão Geral

A **WhatsApp Multi-Platform** é uma solução robusta e escalável que permite gerenciar múltiplos números de WhatsApp simultaneamente através de processos isolados. Cada instância do WhatsApp roda como um processo separado com sessão persistente, garantindo isolamento completo e máxima disponibilidade.

### 🌟 Características Principais

- ✅ **Múltiplos números simultâneos** - Gerenciamento ilimitado de instâncias WhatsApp
- ✅ **Isolamento por processo** - Cada número roda em processo separado com sessão própria
- ✅ **Sessões persistentes** - Dados salvos em volumes dedicados para cada instância
- ✅ **API RESTful completa** - Endpoints para todas as operações
- ✅ **Sistema de filas inteligente** - Controle de concorrência por número
- ✅ **Monitoramento de processos** - Health checks e controle de PIDs
- ✅ **Auto-restart inteligente** - Recuperação automática de sessões ativas
- ✅ **QR Code via Base64** - QR codes servidos diretamente como base64
- ✅ **WebSocket Mirroring** - Espelhamento de mensagens WebSocket dos containers para socket global
- ✅ **Auto-updates** - Verificação inteligente de atualizações
- ✅ **Persistência de sessões** - Sessions sobrevivem a restarts de containers

## 🏗️ Arquitetura

> 🔄 **Arquitetura Atual:** Utilizamos o binário oficial do go-whatsapp-web-multidevice executando múltiplos processos dentro do container da API Gateway. Cada número de telefone roda como um processo separado com sua própria sessão.

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│     Nginx       │    │   API Gateway    │    │   WhatsApp Binary   │
│   (Proxy/LB)    │◄──►│ (Process Manager)│◄──►│  Multiple Processes │
│   Port 80/443   │    │    Port 3000     │    │   Port 8000-8999    │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
         │                       │                         │
         │                       ▼                         │
         │              ┌─────────────────┐                │
         │              │ • Binary Mgr    │                │
         │              │ • Process Ctrl  │                │
         │              │ • Queue System  │                │
         │              │ • Session Mgmt  │                │
         │              │ • Health Check  │                │
         │              └─────────────────┘                │
         │                       │                         │
         ▼                       ▼                         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   SQLite DB     │    │  Binary Manager  │    │   Session Volumes   │
│ (whatsapp.db)   │    │ (PID Tracking)   │    │  (Per Phone Number) │
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
git clone LuizFelipeNeves/go-whatsapp-web-multidevice.git
cd go-whatsapp-web-multidevice

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

## 🔄 Persistência e Auto-Restart

### Sessões Persistentes
- **Volume mapping**: `./sessions:/app/sessions` garante que as sessões sobrevivem a restarts de containers
- **SQLite Database**: Armazenado em `/app/volumes/whatsapp.db` com path absoluto para máxima compatibilidade
- **Session files**: Cada dispositivo tem sua própria pasta em `/app/sessions/{phoneNumber}/`

### Auto-Restart Inteligente
Quando o container inicia, o sistema automaticamente:
1. **Verifica dispositivos registrados** no banco de dados
2. **Detecta sessões existentes** através dos arquivos `whatsapp.db` em cada pasta de sessão  
3. **Reinicia automaticamente** dispositivos com status `active`, `error` ou `stopped` que possuem sessão válida
4. **Logs detalhados** de todo o processo de verificação e restart

### QR Code via Base64
- **Interceptação automática**: Middleware captura arquivos de QR code gerados
- **Conversão base64**: QR codes são convertidos e retornados diretamente na resposta da API
- **Sem exposição de arquivos**: Não há necessidade de servir arquivos estáticos
- **Compatibilidade total**: Funciona com qualquer frontend ou aplicação client

### WebSocket Mirroring
O sistema automaticamente espelha mensagens WebSocket de cada container individual para o socket global:

- **Conexão automática**: Cada processo WhatsApp conecta automaticamente ao WebSocket do container (`ws://localhost:8000/ws`)
- **Espelhamento em tempo real**: Todas as mensagens WebSocket são replicadas para o socket global do servidor
- **Eventos globais**: Clientes podem escutar mensagens de todos os containers via socket principal
- **Eventos específicos**: Clientes podem entrar em rooms específicos (`device-${phoneNumber}`) para escutar apenas um dispositivo
- **Reconexão automática**: Se o WebSocket do container cair, tenta reconectar automaticamente
- **Logs centralizados**: Todos os eventos WebSocket são logados centralmente

#### Eventos Disponíveis:
- `whatsapp-websocket-message` - Mensagens de todos os containers
- `container-websocket-connected` - Quando container conecta
- `container-websocket-closed` - Quando container desconecta
- `device-websocket-message` - Mensagens de dispositivo específico (room: `device-${phoneNumber}`)
- `process-stopped` - Quando processo para inesperadamente

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

// === EVENTOS GLOBAIS ===

// Escutar mensagens WebSocket de todos os containers
socket.on('whatsapp-websocket-message', (data) => {
  console.log(`Mensagem do container ${data.phoneNumber}:`, data.message);
  // data: { phoneNumber, port, message, timestamp }
});

// Escutar conexões de containers WebSocket
socket.on('container-websocket-connected', (data) => {
  console.log(`Container ${data.phoneNumber} conectado na porta ${data.port}`);
});

socket.on('container-websocket-closed', (data) => {
  console.log(`Container ${data.phoneNumber} desconectado (código: ${data.code})`);
});

// === EVENTOS ESPECÍFICOS DE DISPOSITIVO ===

// Entrar na sala de um dispositivo específico
socket.emit('join', `device-${phoneNumber}`);

// Escutar mensagens WebSocket apenas deste dispositivo
socket.on('device-websocket-message', (data) => {
  console.log('Mensagem do dispositivo:', data.message);
  // data: { message, timestamp }
});

// Escutar quando processo para inesperadamente
socket.on('process-stopped', (data) => {
  console.log('Processo parou:', data.phoneNumber);
});

// === EXEMPLO DE USO PRÁTICO ===

// Monitor global - escuta todos os containers
socket.on('whatsapp-websocket-message', (data) => {
  const { phoneNumber, message } = data;
  
  // Processar mensagens específicas
  if (message.type === 'qr') {
    showQRCode(phoneNumber, message.qr);
  } else if (message.type === 'ready') {
    markDeviceAsReady(phoneNumber);
  } else if (message.type === 'message') {
    handleIncomingMessage(phoneNumber, message);
  }
});

// Monitor de dispositivo específico
const monitorDevice = (phoneNumber) => {
  socket.emit('join', `device-${phoneNumber}`);
  
  socket.on('device-websocket-message', (data) => {
    updateDeviceStatus(phoneNumber, data.message);
  });
};
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

# Logs do processo específico (via API Gateway)
curl http://localhost:3000/api/devices/5511999999999/logs
```

### Métricas Importantes

- **Taxa de entrega**: Percentual de mensagens entregues com sucesso
- **Tempo de resposta**: Latência média da API
- **Processos ativos**: Número de instâncias WhatsApp rodando
- **Filas ativas**: Mensagens pendentes por dispositivo
- **Uso de recursos**: CPU, memória e disco

## 🔧 Configuração Avançada

### Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|---------|
| `API_PORT` | Porta da API Gateway | `3000` |
| `PROCESS_BASE_PORT` | Porta inicial dos processos | `8000` |
| `MAX_PROCESSES` | Máximo de processos | `50` |
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
  process: 30000,
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
