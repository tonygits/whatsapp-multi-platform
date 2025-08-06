const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

/**
 * Generate complete OpenAPI documentation with Gateway/Device Management first
 */
function generateOpenAPIFromApp(app) {
  // Load original openapi.yaml as template - Docker path
  const originalPath = path.join(__dirname, '../../openapi.yaml');
  let baseDoc;
  
  try {
    const originalContent = fs.readFileSync(originalPath, 'utf8');
    baseDoc = yaml.load(originalContent);
  } catch (error) {
    console.warn('Could not load original openapi.yaml, using fallback structure');
    baseDoc = createFallbackStructure();
  }

  // Update the base document with dynamic server URL
  baseDoc.servers = [
    { url: 'http://localhost:3000', description: 'Servidor de desenvolvimento' }
  ];

  // Reorganizar tags - Gateway e Device Management primeiro
  baseDoc.tags = [
    { name: 'Gateway', description: 'Autenticação e saúde do gateway' },
    { name: 'Device Management', description: 'Gerenciamento de dispositivos e containers' },
    { name: 'app', description: 'Initial Connection to Whatsapp server' },
    { name: 'user', description: 'Getting information' },
    { name: 'send', description: 'Send Message (Text/Image/File/Video).' },
    { name: 'message', description: 'Message manipulation (revoke/react/update).' },
    { name: 'chat', description: 'Chat conversations and messaging' },
    { name: 'group', description: 'Group setting' },
    { name: 'newsletter', description: 'newsletter setting' }
  ];

  // Alterar security global para bearerAuth apenas
  baseDoc.security = [{ bearerAuth: [] }];

  // Add /api prefix to all WhatsApp API paths and add x-instance-id parameter
  const whatsappPaths = {};
  Object.keys(baseDoc.paths).forEach(originalPath => {
    const newPath = `/api${originalPath}`;
    const pathObj = { ...baseDoc.paths[originalPath] };
    
    // Add x-instance-id parameter to all WhatsApp API routes
    Object.keys(pathObj).forEach(method => {
      if (pathObj[method] && typeof pathObj[method] === 'object') {
        // Initialize parameters array if not exists
        if (!pathObj[method].parameters) {
          pathObj[method].parameters = [];
        }
        
        // Add x-instance-id header parameter
        pathObj[method].parameters.unshift({
          name: 'x-instance-id',
          in: 'header',
          required: true,
          description: 'O número de telefone da instância (ex: 5511999999999)',
          schema: {
            type: 'string',
            example: '5511999999999'
          }
        });

        // Add bearerAuth security to WhatsApp API routes
        pathObj[method].security = [{ bearerAuth: [] }];
      }
    });
    
    whatsappPaths[newPath] = pathObj;
  });

  // Add Gateway Management routes
  const gatewayPaths = {
    '/api/auth/login': {
      post: {
        operationId: 'gatewayLogin',
        tags: ['Gateway'],
        summary: 'Login no API Gateway',
        description: 'Autentica um usuário no gateway e retorna um token JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'admin', description: 'Nome de usuário' },
                  password: { type: 'string', example: 'admin123', description: 'Senha do usuário' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Login realizado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Login realizado com sucesso' },
                    data: {
                      type: 'object',
                      properties: {
                        token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                        user: {
                          type: 'object',
                          properties: {
                            username: { type: 'string', example: 'admin' },
                            role: { type: 'string', example: 'admin' }
                          }
                        },
                        expiresIn: { type: 'string', example: '24h' }
                      }
                    }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Credenciais inválidas',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          }
        }
      }
    },
    '/api/health': {
      get: {
        operationId: 'healthCheck',
        tags: ['Gateway'],
        summary: 'Verificação de saúde do sistema',
        description: 'Verifica o status de saúde da API e serviços conectados',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Sistema saudável',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    timestamp: { type: 'string', format: 'date-time' },
                    services: {
                      type: 'object',
                      properties: {
                        database: { type: 'string', example: 'healthy' },
                        docker: { type: 'string', example: 'healthy' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/devices': {
      get: {
        operationId: 'listDevices',
        tags: ['Device Management'],
        summary: 'Listar dispositivos registrados',
        description: 'Retorna lista de todos os dispositivos WhatsApp registrados',
        parameters: [
          {
            name: 'status',
            in: 'query',
            description: 'Filtrar por status',
            schema: { type: 'string', enum: ['active', 'registered', 'error', 'stopped'] }
          },
          {
            name: 'limit',
            in: 'query', 
            schema: { type: 'integer', default: 25, maximum: 100 }
          },
          {
            name: 'offset',
            in: 'query',
            schema: { type: 'integer', default: 0 }
          }
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de dispositivos',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    devices: { 
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'number', example: 1 },
                          phoneNumber: { type: 'string', example: '5511999999999' },
                          name: { type: 'string', example: 'Atendimento Principal' },
                          status: { type: 'string', example: 'active' },
                          createdAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        operationId: 'createDevice',
        tags: ['Device Management'],
        summary: 'Registrar novo dispositivo',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phoneNumber'],
                properties: {
                  phoneNumber: { type: 'string', example: '5511999999999' },
                  name: { type: 'string', example: 'Atendimento Principal' }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Dispositivo criado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    deviceHash: { type: 'string' },
                    phoneNumber: { type: 'string' },
                    name: { type: 'string' },
                    status: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  // Organizar paths na ordem correta: Gateway -> Device -> WhatsApp API
  const orderedPaths = {};

  // 1. Gateway paths primeiro
  const gatewayPathKeys = Object.keys(gatewayPaths).filter(p => 
    p.startsWith('/api/auth') || p.startsWith('/api/health')
  ).sort();

  // 2. Device Management paths
  const devicePathKeys = Object.keys(gatewayPaths).filter(p => 
    p.startsWith('/api/devices')
  ).sort();

  // 3. WhatsApp API paths por categoria
  const appPaths = Object.keys(whatsappPaths).filter(p => p.startsWith('/api/app')).sort();
  const userPaths = Object.keys(whatsappPaths).filter(p => p.startsWith('/api/user')).sort();
  const sendPaths = Object.keys(whatsappPaths).filter(p => p.startsWith('/api/send')).sort();
  const messagePaths = Object.keys(whatsappPaths).filter(p => p.startsWith('/api/message')).sort();
  const chatPaths = Object.keys(whatsappPaths).filter(p => 
    p.startsWith('/api/chat') && !p.startsWith('/api/chats')
  ).sort();
  const chatsPaths = Object.keys(whatsappPaths).filter(p => p.startsWith('/api/chats')).sort();
  const groupPaths = Object.keys(whatsappPaths).filter(p => p.startsWith('/api/group')).sort();
  const newsletterPaths = Object.keys(whatsappPaths).filter(p => p.startsWith('/api/newsletter')).sort();

  // Adicionar paths na ordem desejada
  [...gatewayPathKeys, ...devicePathKeys, ...appPaths, ...userPaths, 
   ...sendPaths, ...messagePaths, ...chatsPaths, ...chatPaths, 
   ...groupPaths, ...newsletterPaths].forEach(pathKey => {
    if (gatewayPaths[pathKey]) {
      orderedPaths[pathKey] = gatewayPaths[pathKey];
    } else if (whatsappPaths[pathKey]) {
      orderedPaths[pathKey] = whatsappPaths[pathKey];
    }
  });

  baseDoc.paths = orderedPaths;

  // Update security schemes to include only bearer auth
  baseDoc.components.securitySchemes = {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT'
    }
  };

  return baseDoc;
}

function createFallbackStructure() {
  return {
    openapi: "3.0.0",
    info: {
      title: "WhatsApp API MultiDevice",
      version: "6.9.0",
      description: "This API is used for sending whatsapp via API"
    },
    servers: [
      { url: "http://localhost:3000" }
    ],
    tags: [
      { name: "Gateway", description: "Autenticação e saúde do gateway" },
      { name: "Device Management", description: "Gerenciamento de dispositivos e containers" },
      { name: "app", description: "Initial Connection to Whatsapp server" },
      { name: "user", description: "Getting information" },
      { name: "send", description: "Send Message (Text/Image/File/Video)." },
      { name: "message", description: "Message manipulation (revoke/react/update)." },
      { name: "chat", description: "Chat conversations and messaging" },
      { name: "group", description: "Group setting" },
      { name: "newsletter", description: "newsletter setting" }
    ],
    security: [{ bearerAuth: [] }],
    paths: {},
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
      },
      schemas: {
        LoginResponse: {
          type: "object",
          properties: {
            code: { type: "string", example: "SUCCESS" },
            message: { type: "string", example: "Success" },
            results: {
              type: "object",
              properties: {
                qr_duration: { type: "integer", example: 30 },
                qr_link: { type: "string", example: "http://localhost:3000/statics/images/qrcode/scan-qr-b0b7bb43-9a22-455a-814f-5a225c743310.png" }
              }
            }
          }
        },
        ErrorInternalServer: {
          type: "object",
          properties: {
            code: { type: "string", example: "INTERNAL_SERVER_ERROR" },
            message: { type: "string", example: "you are not loggin" },
            results: { type: "object", example: null }
          }
        },
        ErrorBadRequest: {
          type: "object",
          properties: {
            code: { type: "string", example: "400" },
            message: { type: "string", example: "field cannot be blank" },
            results: { type: "object", example: null }
          }
        },
        GenericResponse: {
          type: "object",
          properties: {
            code: { type: "string", example: "SUCCESS" },
            message: { type: "string", example: "Success" },
            results: { type: "string", example: null }
          }
        }
      }
    }
  };
}

module.exports = { generateOpenAPIFromApp };