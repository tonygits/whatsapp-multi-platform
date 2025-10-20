import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

/**
 * Generate complete OpenAPI documentation with Gateway/Device Management first
 */
function generateOpenAPIFromApp(app: any): any {
// Attempts to load openapi.yaml from known paths; falls back to default structure if not found
  const candidatePaths = [
    path.join(__dirname, '../../openapi.yaml'),      // openapi.yaml (Docker)
    path.join(__dirname, '../../../openapi.yaml'),   // project root
    path.join(__dirname, '../../docs_2/openapi.yaml')  // docs/openapi.yaml
  ];

  let baseDoc: any;
  let loaded = false;

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const originalContent = fs.readFileSync(p, 'utf8');
        baseDoc = yaml.load(originalContent);
        loaded = true;
        break;
      }
    } catch (_) {
        // keep trying next paths
    }
  }

  if (!loaded) {
    console.warn('Could not load original openapi.yaml from known locations, using fallback structure');
    baseDoc = createFallbackStructure();
  }

  // Update the base document with dynamic server URL
  baseDoc.servers = [
    { url: process.env.SERVER_URL || 'http://localhost:3000', description: 'Development Server' }
  ];

  // Reorder tags - Gateway and Device Management first
  baseDoc.tags = [
    { name: 'Gateway', description: 'Gateway Authentication and Health' },
    { name: 'Device Management', description: 'Device and container management' },
    { name: 'app', description: 'Initial Connection to Whatsapp server' },
    { name: 'user', description: 'Getting information' },
    { name: 'send', description: 'Send Message (Text/Image/File/Video).' },
    { name: 'message', description: 'Message manipulation (revoke/react/update).' },
    { name: 'chat', description: 'Chat conversations and messaging' },
    { name: 'group', description: 'Group setting' },
    { name: 'newsletter', description: 'newsletter setting' }
  ];

  // Change global security to basicAuth
  baseDoc.security = [{ basicAuth: [] }];

  // Add /api prefix to all WhatsApp API paths and add x-instance-id parameter
  const whatsappPaths: Record<string, any> = {};
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
          description: 'The deviceHash of the instance (e.g. a1b2c3d4e5f67890)',
          schema: {
            type: 'string',
            example: 'a1b2c3d4e5f67890'
          }
        });

        // Add basicAuth security to WhatsApp API routes
        pathObj[method].security = [{ basicAuth: [] }];
      }
    });
    
    whatsappPaths[newPath] = pathObj;
  });

  // Add Gateway Management routes
  const gatewayPaths: Record<string, any> = {
    '/api/health': {
      get: {
        operationId: 'healthCheck',
        tags: ['Gateway'],
        summary: 'System health check',
        description: 'Checks the health status of the API and connected services',
        security: [{ basicAuth: [] }],
        responses: {
          '200': {
            description: 'Healthy system',
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
        summary: 'List registered devices',
        description: 'Returns list of all registered WhatsApp devices',
        parameters: [
          {
            name: 'status',
            in: 'query',
            description: 'Filter by status',
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
        security: [{ basicAuth: [] }],
        responses: {
          '200': {
            description: 'Device list',
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
                          deviceHash: { type: 'string', example: 'a1b2c3d4e5f67890' },
                          status: { type: 'string', example: 'active' },
                          phoneNumber: { type: 'string', example: '1234567890' },
                          webhookUrl: { type: 'string', format: 'url', nullable: true },
                          webhookSecret: { type: 'string', nullable: true },
                          statusWebhookUrl: { type: 'string', format: 'url', nullable: true },
                          statusWebhookSecret: { type: 'string', nullable: true },
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
        summary: 'Register new device',
        security: [{ basicAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  webhookUrl: { type: 'string', format: 'url', nullable: true, example: 'https://meusite.com/webhook/messages' },
                  webhookSecret: { type: 'string', nullable: true, example: 'my-secret-messages' },
                  phoneNumber: { type: 'string', nullable: false, example: '1553765112' },
                  statusWebhookUrl: { type: 'string', format: 'url', nullable: true, example: 'https://meusite.com/webhook/status' },
                  statusWebhookSecret: { type: 'string', nullable: true, example: 'meu-secret-status' },
                  autoStart: { type: 'boolean', default: true, example: true }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Device created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    deviceHash: { type: 'string' },
                    name: { type: 'string' },
                    status: { type: 'string' },
                    phoneNumber: { type: 'string' },
                    webhookUrl: { type: 'string', format: 'url', nullable: true },
                    webhookSecret: { type: 'string', nullable: true },
                    statusWebhookUrl: { type: 'string', format: 'url', nullable: true },
                    statusWebhookSecret: { type: 'string', nullable: true }
                  }
                }
              }
            }
          }
        }
      },
      put: {
        operationId: 'updateDeviceInfo',
        tags: ['Device Management'],
        summary: 'Update device information',
        description: 'Updates a device\'s name, message webhooks, and status webhooks.',
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'query',
            required: true,
            description: 'The deviceHash of the instance (e.g. a1b2c3d4e5f67890)',
            schema: {
              type: 'string',
              example: 'a1b2c3d4e5f67890'
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
                  name: { type: 'string', example: 'New Device Name' },
                  webhookUrl: { type: 'string', format: 'url', nullable: true, example: 'https://meusite.com/webhook/messages' },
                  webhookSecret: { type: 'string', nullable: true, example: 'new-secret-messages' },
                  statusWebhookUrl: { type: 'string', format: 'url', nullable: true, example: 'https://meusite.com/webhook/status' },
                  statusWebhookSecret: { type: 'string', nullable: true, example: 'novo-secret-status' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Device updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Device updated successfully' },
                    data: {
                      type: 'object',
                      properties: {
                        deviceHash: { type: 'string' },
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
            description: 'Device not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          }
        }
      },
      delete: {
        operationId: 'deleteDevice',
        tags: ['Device Management'],
        summary: 'Remove a device',
        description: 'Removes a device and its associated Docker container.',
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'query',
            required: true,
            description: 'The deviceHash of the instance (e.g. a1b2c3d4e5f67890)',
            schema: {
              type: 'string',
              example: 'a1b2c3d4e5f67890'
            }
          },
          {
            name: 'force',
            in: 'query',
            required: false,
            description: 'Force removal even if the process cannot be stopped.',
            schema: {
              type: 'boolean',
              default: false
            }
          }
        ],
        responses: {
          '200': {
            description: 'Device removed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Device removed successfully' }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Device not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Error removing device',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorInternalServer' }
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
        summary: 'Get information from a specific device',
        description: 'Returns details of a WhatsApp device, including status and QR Code (if available).',
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'query',
            required: true,
            description: 'The deviceHash of the instance (e.g. a1b2c3d4e5f67890)',
            schema: {
              type: 'string',
              example: 'a1b2c3d4e5f67890'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Device information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'number', example: 1 },
                    deviceHash: { type: 'string', example: 'a1b2c3d4e5f67890' },
                    name: { type: 'string', example: 'Main Service' },
                    status: { type: 'string', example: 'connected' },
                    phoneNumber: { type: 'string', example: '1234567890' },
                    processStatus: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'running' },
                        containerId: { type: 'string', example: 'a1b2c3d4e5f6' }
                      }
                    },
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
            description: 'Device not found',
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
        summary: 'Launch a device',
        description: 'Starts the Docker container associated with a device.',
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'query',
            required: true,
            description: 'The deviceHash of the instance (e.g. a1b2c3d4e5f67890)',
            schema: {
              type: 'string',
              example: 'a1b2c3d4e5f67890'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Device started successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Process started successfully' }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Device not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Error starting device',
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
        summary: 'Stop a device',
        description: 'For the Docker container associated with a device.',
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'query',
            required: true,
            description: 'The deviceHash of the instance (e.g. a1b2c3d4e5f67890)',
            schema: {
              type: 'string',
              example: 'a1b2c3d4e5f67890'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Device stopped successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Process stopped successfully' }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Device not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Error stopping device',
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
        summary: 'Restart a device',
        description: 'Restarts the Docker container associated with a device.',
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: 'x-instance-id',
            in: 'query',
            required: true,
            description: 'The deviceHash of the instance (e.g. a1b2c3d4e5f67890)',
            schema: {
              type: 'string',
              example: 'a1b2c3d4e5f67890'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Device restarted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Process restarted successfully' }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Device not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Error restarting device',
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

  // Arrange paths in the correct order: Gateway -> Device -> WhatsApp API
  const orderedPaths: Record<string, any> = {};

  // 1. Gateway paths first
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

 // Add paths in the desired order
  [...gatewayPathKeys, ...devicePathKeys, ...appPaths, ...userPaths, 
   ...sendPaths, ...messagePaths, ...chatsPaths, ...chatPaths, 
   ...groupPaths, ...newsletterPaths].forEach(pathKey => {
    if (gatewayPaths[pathKey]) {
      console.log(`Adding gateway path: ${pathKey}`);
      orderedPaths[pathKey] = gatewayPaths[pathKey];
    } else if (whatsappPaths[pathKey]) {
      console.log(`Adding whatsapp path: ${pathKey}`);
      orderedPaths[pathKey] = whatsappPaths[pathKey];
    }
  });

  baseDoc.paths = orderedPaths;

  // Update security schemes to include only basic auth
  baseDoc.components.securitySchemes = {
    basicAuth: {
      type: 'http',
      scheme: 'basic'
    }
  };

  return baseDoc;
}

function createFallbackStructure(): any {
  return {
    openapi: "3.0.0",
    info: {
      title: "WhatsApp API MultiDevice",
      version: "6.9.0",
      description: "API for sending WhatsApp messages with support for multiple devices and status webhooks.\n\n## Status Webhooks\n\nThis system supports webhooks for device status notifications:\n\n### Configuration\n- `statusWebhook`: URL to receive status notifications\n- `statusWebhookSecret`: Secret key for HMAC-SHA256 signature\n\n### Supported Events\n- **login_success**: Device connected successfully\n- **connected**: Device ready to use\n- **disconnected**: Device disconnected\n\n- **auth_failed**: Authentication failed\n- **container_event**: Other container events\n\n### Webhook Format\n```json\n{\n \"device\": {\n \"deviceHash\": \"a1b2c3d4e5f67890\",\n \"status\": \"active\"\n },\n \"event\": {\n \"type\": \"connected\",\n \"code\": \"LIST_DEVICES\",\n \"message\": \"Device connected and ready\"\n },\n \"timestamp\": \"2024-01-01T12:00:00.000Z\"\n}\n```\n\n### Signature Check\nIf `statusWebhookSecret` was set, the `X-Webhook-Signature` header will contain the HMAC-SHA256 signature of the payload."
    },
    servers: [
      { url: "http://localhost:3000" }
    ],
    tags: [
      { name: "Gateway", description: "Gateway Authentication and Health" },
      { name: "Device Management", description: "Device and container management" },
      { name: "app", description: "Initial Connection to Whatsapp server" },
      { name: "user", description: "Getting information" },
      { name: "send", description: "Send Message (Text/Image/File/Video)." },
      { name: "message", description: "Message manipulation (revoke/react/update)." },
      { name: "chat", description: "Chat conversations and messaging" },
      { name: "group", description: "Group setting" },
      { name: "newsletter", description: "newsletter setting" }
    ],
    security: [{ basicAuth: [] }],
    paths: {},
    components: {
      securitySchemes: {
        basicAuth: { type: "http", scheme: "basic" }
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
            message: { type: "string", example: "you are not logged in" },
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

export { generateOpenAPIFromApp };
