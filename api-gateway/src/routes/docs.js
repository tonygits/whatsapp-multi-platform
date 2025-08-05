const express = require('express');
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * GET /docs
 * Servir Swagger UI
 */
router.get('/', (req, res) => {
  const swaggerHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Multi-Platform API Documentation</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui.css" />
    <style>
        html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }
        *, *:before, *:after {
            box-sizing: inherit;
        }
        body {
            margin:0;
            background: #fafafa;
        }
        .swagger-ui .topbar {
            background-color: #25D366;
        }
        .swagger-ui .info .title {
            color: #25D366;
        }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            const ui = SwaggerUIBundle({
                url: '/docs/openapi.yaml',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                validatorUrl: null,
                tryItOutEnabled: true,
                requestInterceptor: function(request) {
                    // Adicionar token JWT automaticamente se disponível
                    const token = localStorage.getItem('jwt_token');
                    if (token) {
                        request.headers['Authorization'] = 'Bearer ' + token;
                    }
                    return request;
                }
            });
        };
    </script>
</body>
</html>`;

  res.send(swaggerHtml);
});

/**
 * GET /docs/openapi.yaml
 * Servir arquivo OpenAPI
 */
router.get('/openapi.yaml', asyncHandler(async (req, res) => {
  try {
    const yamlPath = path.join(__dirname, '../../docs/openapi.yaml');
    const yamlContent = await fs.promises.readFile(yamlPath, 'utf8');
    
    res.set('Content-Type', 'application/yaml');
    res.send(yamlContent);
  } catch (error) {
    res.status(404).json({
      error: 'Arquivo OpenAPI não encontrado',
      code: 'OPENAPI_NOT_FOUND'
    });
  }
}));

/**
 * GET /docs/openapi.json
 * Servir OpenAPI em formato JSON
 */
router.get('/openapi.json', asyncHandler(async (req, res) => {
  try {
    const yamlPath = path.join(__dirname, '../../docs/openapi.yaml');
    const yamlContent = await fs.promises.readFile(yamlPath, 'utf8');
    const jsonContent = yaml.load(yamlContent);
    
    res.json(jsonContent);
  } catch (error) {
    res.status(404).json({
      error: 'Arquivo OpenAPI não encontrado',
      code: 'OPENAPI_NOT_FOUND'
    });
  }
}));

/**
 * GET /docs/postman
 * Gerar coleção do Postman
 */
router.get('/postman', asyncHandler(async (req, res) => {
  try {
    const yamlPath = path.join(__dirname, '../../docs/openapi.yaml');
    const yamlContent = await fs.promises.readFile(yamlPath, 'utf8');
    const openapi = yaml.load(yamlContent);
    
    // Converter OpenAPI para formato Postman (simplificado)
    const postmanCollection = {
      info: {
        name: openapi.info.title,
        description: openapi.info.description,
        version: openapi.info.version,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      auth: {
        type: "bearer",
        bearer: [
          {
            key: "token",
            value: "{{jwt_token}}",
            type: "string"
          }
        ]
      },
      variable: [
        {
          key: "baseUrl",
          value: "http://localhost:3000",
          type: "string"
        },
        {
          key: "jwt_token",
          value: "",
          type: "string"
        }
      ],
      item: []
    };

    // Adicionar endpoints principais
    const mainEndpoints = [
      {
        name: "🔐 Autenticação",
        item: [
          {
            name: "Login",
            request: {
              method: "POST",
              header: [
                {
                  key: "Content-Type",
                  value: "application/json"
                }
              ],
              body: {
                mode: "raw",
                raw: JSON.stringify({
                  username: "admin",
                  password: "admin123"
                }, null, 2)
              },
              url: {
                raw: "{{baseUrl}}/api/auth/login",
                host: ["{{baseUrl}}"],
                path: ["api", "auth", "login"]
              }
            }
          }
        ]
      },
      {
        name: "📱 Dispositivos",
        item: [
          {
            name: "Listar Dispositivos",
            request: {
              method: "GET",
              header: [],
              url: {
                raw: "{{baseUrl}}/api/devices",
                host: ["{{baseUrl}}"],
                path: ["api", "devices"]
              }
            }
          },
          {
            name: "Registrar Dispositivo",
            request: {
              method: "POST",
              header: [
                {
                  key: "Content-Type",
                  value: "application/json"
                }
              ],
              body: {
                mode: "raw",
                raw: JSON.stringify({
                  phoneNumber: "+5511999999999",
                  name: "Atendimento Principal"
                }, null, 2)
              },
              url: {
                raw: "{{baseUrl}}/api/devices",
                host: ["{{baseUrl}}"],
                path: ["api", "devices"]
              }
            }
          }
        ]
      },
      {
        name: "💬 Mensagens",
        item: [
          {
            name: "Enviar Mensagem",
            request: {
              method: "POST",
              header: [
                {
                  key: "Content-Type",
                  value: "application/json"
                }
              ],
              body: {
                mode: "raw",
                raw: JSON.stringify({
                  from: "+5511999999999",
                  to: "+5511888888888",
                  message: "Olá! Como posso ajudar?"
                }, null, 2)
              },
              url: {
                raw: "{{baseUrl}}/api/messages/send",
                host: ["{{baseUrl}}"],
                path: ["api", "messages", "send"]
              }
            }
          }
        ]
      }
    ];

    postmanCollection.item = mainEndpoints;

    res.set('Content-Type', 'application/json');
    res.set('Content-Disposition', 'attachment; filename="WhatsApp-Multi-Platform.postman_collection.json"');
    res.json(postmanCollection);
  } catch (error) {
    res.status(500).json({
      error: 'Erro ao gerar coleção Postman',
      code: 'POSTMAN_GENERATION_ERROR'
    });
  }
}));

module.exports = router;