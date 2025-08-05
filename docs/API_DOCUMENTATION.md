# 📚 WhatsApp Multi-Platform - Documentação da API

## 🌟 Visão Geral

A API WhatsApp Multi-Platform permite gerenciar múltiplos números de WhatsApp através de containers Docker isolados, proporcionando escalabilidade e robustez operacional.

## 🔑 Autenticação

Todas as rotas protegidas requerem autenticação via JWT token:

```bash
Authorization: Bearer <jwt_token>
```

### Obter Token

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}
```

## 📱 Endpoints de Dispositivos

### Listar Dispositivos

```http
GET /api/devices
Authorization: Bearer <token>
```

**Parâmetros de Query:**
- `status` (opcional): Filtrar por status (`active`, `registered`, `error`)
- `limit` (opcional): Limite de resultados
- `offset` (opcional): Deslocamento para paginação

### Registrar Novo Dispositivo

```http
POST /api/devices
Authorization: Bearer <token>
Content-Type: application/json

{
  "phoneNumber": "+5511999999999",
  "name": "Atendimento",
  "autoStart": true
}
```

### Obter Dispositivo Específico

```http
GET /api/devices/{phoneNumber}
Authorization: Bearer <token>
```

### Atualizar Dispositivo

```http
PUT /api/devices/{phoneNumber}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Novo Nome",
  "status": "active"
}
```

### Remover Dispositivo

```http
DELETE /api/devices/{phoneNumber}
Authorization: Bearer <token>
```

**Parâmetros de Query:**
- `force` (opcional): Força remoção mesmo se container estiver rodando

### Controle de Container

#### Iniciar Container
```http
POST /api/devices/{phoneNumber}/start
Authorization: Bearer <token>
```

#### Parar Container
```http
POST /api/devices/{phoneNumber}/stop
Authorization: Bearer <token>
```

#### Reiniciar Container
```http
POST /api/devices/{phoneNumber}/restart
Authorization: Bearer <token>
```

### QR Code

#### Obter QR Code
```http
GET /api/devices/{phoneNumber}/qr
Authorization: Bearer <token>
```

#### Solicitar Novo QR Code
```http
POST /api/devices/{phoneNumber}/refresh-qr
Authorization: Bearer <token>
```

## 💬 Endpoints de Mensagens

### Enviar Mensagem

```http
POST /api/messages/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "from": "+5511999999999",
  "to": "+5511888888888",
  "message": "Olá! Como posso ajudar?",
  "type": "text",
  "priority": 5
}
```

### Enviar Mensagens em Lote

```http
POST /api/messages/send-bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "from": "+5511999999999",
  "messages": [
    {
      "to": "+5511888888888",
      "message": "Mensagem 1",
      "type": "text"
    },
    {
      "to": "+5511777777777",
      "message": "Mensagem 2",
      "type": "text"
    }
  ],
  "priority": 5
}
```

### Enviar Mídia

```http
POST /api/messages/send-media
Authorization: Bearer <token>
Content-Type: application/json

{
  "from": "+5511999999999",
  "to": "+5511888888888",
  "media": "https://example.com/image.jpg",
  "caption": "Legenda da imagem",
  "type": "image",
  "priority": 5
}
```

### Gerenciar Filas

#### Status da Fila
```http
GET /api/messages/queue/{phoneNumber}
Authorization: Bearer <token>
```

#### Status de Todas as Filas
```http
GET /api/messages/queues
Authorization: Bearer <token>
```

#### Pausar Fila
```http
POST /api/messages/queue/{phoneNumber}/pause
Authorization: Bearer <token>
```

#### Retomar Fila
```http
POST /api/messages/queue/{phoneNumber}/resume
Authorization: Bearer <token>
```

#### Limpar Fila
```http
DELETE /api/messages/queue/{phoneNumber}
Authorization: Bearer <token>
```

## 🔧 Endpoints de Monitoramento

### Health Check Básico

```http
GET /api/health
```

### Health Check Detalhado

```http
GET /api/health/detailed
```

### Status dos Dispositivos

```http
GET /api/health/devices
```

### Status dos Containers

```http
GET /api/health/containers
```

### Métricas do Sistema

```http
GET /api/health/system
```

### Auto-Healing

```http
POST /api/health/auto-heal
Authorization: Bearer <token>
Content-Type: application/json

{
  "services": ["containers", "queues"]
}
```

## 👥 Gerenciamento de Usuários

### Criar Usuário (Admin)

```http
POST /api/auth/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "novo_usuario",
  "password": "senha_segura",
  "role": "user"
}
```

### Listar Usuários (Admin)

```http
GET /api/auth/users
Authorization: Bearer <token>
```

### Remover Usuário (Admin)

```http
DELETE /api/auth/users/{username}
Authorization: Bearer <token>
```

### Alterar Senha

```http
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "senha_atual",
  "newPassword": "nova_senha"
}
```

## 🔌 WebSocket Events

### Conectar ao WebSocket

```javascript
const socket = io('http://localhost:3000');

// Entrar na sala de um dispositivo específico
socket.emit('join-device', '+5511999999999');
```

### Eventos Disponíveis

#### QR Code Gerado
```javascript
socket.on('qr-code', (data) => {
  console.log('QR Code:', data.qrImage);
  console.log('Expira em:', data.expiresAt);
});
```

#### QR Code Expirado
```javascript
socket.on('qr-expired', (data) => {
  console.log('QR Code expirado para:', data.phoneNumber);
});
```

#### Autenticação Bem-sucedida
```javascript
socket.on('auth-success', (data) => {
  console.log('Dispositivo autenticado:', data.phoneNumber);
});
```

#### Mensagem Enviada
```javascript
socket.on('message-sent', (data) => {
  console.log('Mensagem enviada:', data);
});
```

#### Container Parado
```javascript
socket.on('container-stopped', (data) => {
  console.log('Container parou:', data.phoneNumber);
});
```

#### Fila Idle
```javascript
socket.on('queue-idle', (data) => {
  console.log('Fila vazia:', data.phoneNumber);
});
```

## 📊 Códigos de Status

- `200` - Sucesso
- `201` - Criado
- `400` - Requisição Inválida
- `401` - Não Autorizado
- `403` - Proibido
- `404` - Não Encontrado
- `409` - Conflito
- `429` - Muitas Requisições
- `500` - Erro Interno
- `503` - Serviço Indisponível

## 🚦 Rate Limiting

- **API Geral**: 100 requisições por 15 minutos por IP
- **Autenticação**: 5 requisições por 15 minutos por IP
- **Nginx**: 10 requisições por segundo

## 📝 Exemplos de Uso

### Fluxo Completo - Adicionar Dispositivo

```bash
# 1. Fazer login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 2. Registrar dispositivo
curl -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+5511999999999","name":"Atendimento"}'

# 3. Obter QR Code
curl -X GET http://localhost:3000/api/devices/+5511999999999/qr \
  -H "Authorization: Bearer <token>"

# 4. Enviar mensagem
curl -X POST http://localhost:3000/api/messages/send \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+5511999999999",
    "to": "+5511888888888",
    "message": "Olá! Esta é uma mensagem de teste."
  }'
```

## 🔍 Monitoramento e Logs

### Visualizar Logs
```bash
# Logs da API Gateway
docker-compose logs -f api-gateway

# Logs de um container específico
docker logs whatsapp-+5511999999999

# Logs do Nginx
docker-compose logs -f nginx
```

### Métricas importantes
- Taxa de sucesso de mensagens
- Tempo de resposta da API
- Status dos containers
- Uso de memória e CPU
- Filas ativas

## 🛠️ Troubleshooting

### Problemas Comuns

#### Container não inicia
```bash
# Verificar logs
docker-compose logs api-gateway

# Verificar permissões Docker
ls -la /var/run/docker.sock
```

#### QR Code não aparece
```bash
# Verificar status do container
curl http://localhost:3000/api/devices/{phoneNumber}

# Reiniciar container
curl -X POST http://localhost:3000/api/devices/{phoneNumber}/restart \
  -H "Authorization: Bearer <token>"
```

#### Mensagens não enviam
```bash
# Verificar status da fila
curl http://localhost:3000/api/messages/queue/{phoneNumber} \
  -H "Authorization: Bearer <token>"

# Verificar se dispositivo está autenticado
curl http://localhost:3000/api/devices/{phoneNumber} \
  -H "Authorization: Bearer <token>"
```