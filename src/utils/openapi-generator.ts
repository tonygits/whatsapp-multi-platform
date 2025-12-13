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
    { name: 'Phone number', description: 'Phone number and container' },
    { name: 'app', description: 'Initial Connection to Whatsapp server' },
    { name: 'user', description: 'Getting information' },
    { name: 'send', description: 'Send Message (Text/Image/File/Video).' },
    { name: 'message', description: 'Message manipulation (revoke/react/update).' },
    { name: 'chat', description: 'Chat conversations and messaging' },
    { name: 'group', description: 'Group setting' },
    { name: 'newsletter', description: 'newsletter setting' }
  ];

  // Change global security to bearerAuth
  baseDoc.security = [{ bearerAuth: [] }];

  // Add /api prefix to all WhatsApp API paths and add numberHash parameter
  const whatsappPaths: Record<string, any> = {};
  Object.keys(baseDoc.paths).forEach(originalPath => {
    const newPath = `/api${originalPath}`;
    const pathObj = { ...baseDoc.paths[originalPath] };
    
    // Add numberHash parameter to all WhatsApp API routes
    Object.keys(pathObj).forEach(method => {
      if (pathObj[method] && typeof pathObj[method] === 'object') {
        // Initialize parameters array if not exists
        if (!pathObj[method].parameters) {
          pathObj[method].parameters = [];
        }

        // Add bearerAuth security to WhatsApp API routes
        pathObj[method].security = [{ bearerAuth: [] }];
      }
    });
    
    whatsappPaths[newPath] = pathObj;
  });

  // Add Gateway Management routes
  const gatewayPaths: Record<string, any> = {
    '/health': {
      get: {
        operationId: 'healthCheck',
        tags: ['Gateway'],
        summary: 'System health check',
        description: 'Checks the health status of the API and connected services',
        security: [{ bearerAuth: [] }],
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
    '/phone_numbers': {
      put: {
        operationId: 'updatePhoneNumberInfo',
        tags: ['Phone number Management'],
        summary: 'Update phone number information',
        description: 'Updates a phone number\'s name, message webhooks, and status webhooks.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'numberHash',
            in: 'query',
            required: true,
            description: 'The numberHash of the instance (e.g. a1b2c3d4e5f67890)',
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
                  name: { type: 'string', example: 'Updated Name' },
                  webhookUrl: { type: 'string', format: 'url', nullable: true, example: 'https://meusite.com/webhook/messages' },
                  webhookSecret: { type: 'string', nullable: true, example: 'updated-secret-messages' },
                  statusWebhookUrl: { type: 'string', format: 'url', nullable: true, example: 'https://meusite.com/webhook/status' },
                  statusWebhookSecret: { type: 'string', nullable: true, example: 'novo-secret-status' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Phone number updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Phone number updated successfully' },
                    data: {
                      type: 'object',
                      properties: {
                        numberHash: { type: 'string' },
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
            description: 'Phone number not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          }
        }
      },
      delete: {
        operationId: 'deletePhoneNumber',
        tags: ['Phone number Management'],
        summary: 'Remove a phone number',
        description: 'Removes a phone number and its associated Docker container.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'numberHash',
            in: 'query',
            required: true,
            description: 'The numberHash of the instance (e.g. a1b2c3d4e5f67890)',
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
            description: 'Phone number removed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Phone number removed successfully' }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Phone number not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Error removing phone number',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorInternalServer' }
              }
            }
          }
        }
      }
    },
    '/phone_numbers/info': {
      get: {
        operationId: 'getPhoneNumberInfo',
        tags: ['Phone number Management'],
        summary: 'Get information from a specific phone number',
        description: 'Returns details of a WhatsApp phone number, including status and QR Code (if available).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'numberHash',
            in: 'query',
            required: true,
            description: 'The numberHash of the instance (e.g. a1b2c3d4e5f67890)',
            schema: {
              type: 'string',
              example: 'a1b2c3d4e5f67890'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Phone number information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'number', example: 1 },
                    numberHash: { type: 'string', example: 'a1b2c3d4e5f67890' },
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
            description: 'Phone number not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          }
        }
      }
    },
    '/phone_numbers/start': {
      post: {
        operationId: 'startPhoneNumber',
        tags: ['Phone number Management'],
        summary: 'Launch a phone number',
        description: 'Starts the Docker container associated with a phone number.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'numberHash',
            in: 'query',
            required: true,
            description: 'The numberHash of the instance (e.g. a1b2c3d4e5f67890)',
            schema: {
              type: 'string',
              example: 'a1b2c3d4e5f67890'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Phone number started successfully',
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
            description: 'Phone number not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Error starting phone number',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorInternalServer' }
              }
            }
          }
        }
      }
    },
    '/phone_numbers/stop': {
      post: {
        operationId: 'stopPhoneNumber',
        tags: ['Phone number Management'],
        summary: 'Stop a phone number',
        description: 'For the Docker container associated with a phone number.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'numberHash',
            in: 'query',
            required: true,
            description: 'The numberHash of the instance (e.g. a1b2c3d4e5f67890)',
            schema: {
              type: 'string',
              example: 'a1b2c3d4e5f67890'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Phone number stopped successfully',
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
            description: 'Phone number not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Error stopping phone number',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorInternalServer' }
              }
            }
          }
        }
      }
    },
    '/phone_numbers/restart': {
      post: {
        operationId: 'restartPhoneNumber',
        tags: ['Phone number Management'],
        summary: 'Restart a phone number',
        description: 'Restarts the Docker container associated with a phone number.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'numberHash',
            in: 'query',
            required: true,
            description: 'The numberHash of the instance (e.g. a1b2c3d4e5f67890)',
            schema: {
              type: 'string',
              example: 'a1b2c3d4e5f67890'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Phone number restarted successfully',
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
            description: 'Phone number not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorBadRequest' }
              }
            }
          },
          '500': {
            description: 'Error restarting phone number',
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
    p.startsWith('/health')
  ).sort();

  // 2. Device Management paths
  const numberPathKeys = Object.keys(gatewayPaths).filter(p =>
    p.startsWith('/phone_numbers')
  ).sort();

  // 3. WhatsApp API paths por category
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
  [...gatewayPathKeys, ...numberPathKeys, ...appPaths, ...userPaths,
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
    bearerAuth: {
      type: 'http',
      scheme: 'bearer'
    }
  };

  return baseDoc;
}

function createFallbackStructure(): any {
  return {
    openapi: "3.0.0",
    info: {
      title: "Wapflow API",
      version: "6.9.0",
      description: "API for sending WhatsApp messages with support for multiple phone numbers and status webhooks.\n\n## Status Webhooks\n\nThis system supports webhooks for phone number status notifications:\n\n### Configuration\n- `statusWebhook`: URL to receive status notifications\n- `statusWebhookSecret`: Secret key for HMAC-SHA256 signature\n\n### Supported Events\n- **login_success**: Phone number connected successfully\n- **connected**: Phone number ready to use\n- **disconnected**: Phone number disconnected\n\n- **auth_failed**: Authentication failed\n- **container_event**: Other container events\n\n### Webhook Format\n```json\n{\n \"phone number\": {\n \"numberHash\": \"a1b2c3d4e5f67890\",\n \"status\": \"active\"\n },\n \"event\": {\n \"type\": \"connected\",\n \"code\": \"LIST_PHONE_NUMBERS\",\n \"message\": \"Phone number connected and ready\"\n },\n \"timestamp\": \"2024-01-01T12:00:00.000Z\"\n}\n```\n\n### Signature Check\nIf `statusWebhookSecret` was set, the `X-Webhook-Signature` header will contain the HMAC-SHA256 signature of the payload."
    },
    servers: [
      { url: process.env.SERVER_URL }
    ],
    tags: [
      { name: "Gateway", description: "Gateway Authentication and Health" },
      { name: "Phone number Management", description: "Phone number and container management" },
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
          bearerAuth: { type: "http", scheme: "bearer" }
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
