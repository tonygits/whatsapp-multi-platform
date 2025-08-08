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
                          webhookUrl: { type: 'string', format: 'url', nullable: true },
                          webhookSecret: { type: 'string', nullable: true },
                          createdAt: { type: 'string', format: 'date-time' },
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
                    status: { type: 'string' },
                    webhookUrl: { type: 'string', format: 'url', nullable: true },
                    webhookSecret: { type: 'string', nullable: true }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/devices/info': {
      get: {
        operationId: 'getDeviceInfo',
        tags: ['Device Management'],
        summary: 'Obter informações de um dispositivo específico',
        description: 'Retorna detalhes de um dispositivo WhatsApp, incluindo status e QR Code (se disponível).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'header',
            required: true,
            description: 'O número de telefone da instância (ex: 5511999999999)',
            schema: {
              type: 'string',
              example: '5511999999999'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Informações do dispositivo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'number', example: 1 },
                    deviceHash: { type: 'string' },
                    phoneNumber: { type: 'string', example: '5511999999999' },
                    name: { type: 'string', example: 'Atendimento Principal' },
                    status: { type: 'string', example: 'connected' },
                    processStatus: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'running' },
                        containerId: { type: 'string', example: 'a1b2c3d4e5f6' }
                      }
                    },
                    qrCode: { type: 'string', nullable: true, example: 'data:image/png;base64,...' },
                    lastSeen: { type: 'string', format: 'date-time' },
                    createdAt: { type: 'string', format: 'date-time' },
                    webhookUrl: { type: 'string', format: 'url', nullable: true },
                    webhookSecret: { type: 'string', nullable: true }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Dispositivo não encontrado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          }
        }
      },
      put: {
        operationId: 'updateDeviceInfo',
        tags: ['Device Management'],
        summary: 'Atualizar informações de um dispositivo',
        description: 'Atualiza o nome ou a URL do webhook de um dispositivo.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'header',
            required: true,
            description: 'O número de telefone da instância (ex: 5511999999999)',
            schema: {
              type: 'string',
              example: '5511999999999'
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Novo Nome do Dispositivo' },
                  webhookUrl: { type: 'string', format: 'url', nullable: true, example: 'https://your-webhook.com/new-endpoint' },
                  webhookSecret: { type: 'string', nullable: true, example: 'your_new_secret_key' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Dispositivo atualizado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Dispositivo atualizado com sucesso' },
                    data: {
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
          },
          '404': {
            description: 'Dispositivo não encontrado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          }
        }
      }
    },
    '/api/devices/start': {
      post: {
        operationId: 'startDevice',
        tags: ['Device Management'],
        summary: 'Iniciar um dispositivo',
        description: 'Inicia o container Docker associado a um dispositivo.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'header',
            required: true,
            description: 'O número de telefone da instância (ex: 5511999999999)',
            schema: {
              type: 'string',
              example: '5511999999999'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Dispositivo iniciado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Processo iniciado com sucesso' }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Dispositivo não encontrado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Erro ao iniciar dispositivo',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorInternalServer' }
              }
            }
          }
        }
      }
    },
    '/api/devices/stop': {
      post: {
        operationId: 'stopDevice',
        tags: ['Device Management'],
        summary: 'Parar um dispositivo',
        description: 'Para o container Docker associado a um dispositivo.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'header',
            required: true,
            description: 'O número de telefone da instância (ex: 5511999999999)',
            schema: {
              type: 'string',
              example: '5511999999999'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Dispositivo parado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Processo parado com sucesso' }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Dispositivo não encontrado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Erro ao parar dispositivo',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorInternalServer' }
              }
            }
          }
        }
      }
    },
    '/api/devices/restart': {
      post: {
        operationId: 'restartDevice',
        tags: ['Device Management'],
        summary: 'Reiniciar um dispositivo',
        description: 'Reinicia o container Docker associado a um dispositivo.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'header',
            required: true,
            description: 'O número de telefone da instância (ex: 5511999999999)',
            schema: {
              type: 'string',
              example: '5511999999999'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Dispositivo reiniciado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Processo reiniciado com sucesso' }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Dispositivo não encontrado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Erro ao reiniciar dispositivo',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorInternalServer' }
              }
            }
          }
        }
      }
    },
    '/api/devices/delete': {
      delete: {
        operationId: 'deleteDevice',
        tags: ['Device Management'],
        summary: 'Remover um dispositivo',
        description: 'Remove um dispositivo e seu container Docker associado.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'header',
            required: true,
            description: 'O número de telefone da instância (ex: 5511999999999)',
            schema: {
              type: 'string',
              example: '5511999999999'
            }
          },
          {
            name: 'force',
            in: 'query',
            required: false,
            description: 'Forçar a remoção mesmo se o processo não puder ser parado.',
            schema: {
              type: 'boolean',
              default: false
            }
          }
        ],
        responses: {
          '200': {
            description: 'Dispositivo removido com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Dispositivo removido com sucesso' }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Dispositivo não encontrado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Erro ao remover dispositivo',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorInternalServer' }
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
    basicAuth: {
      type: 'http',
      scheme: 'basic'
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