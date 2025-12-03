import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import yaml from 'js-yaml';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import { asyncHandler } from '../middleware/errorHandler';
import { generateOpenAPIFromApp } from '../utils/openapi-generator';

const router = express.Router();

// Load OpenAPI specification
let swaggerDocument: any = null;
let allReadyForcedRegenerate = false;

async function generateAndLoadSwaggerDocument(forceRegenerate = false, expressApp: any = null): Promise<any> {
  if (!swaggerDocument || forceRegenerate) {
    try {
      if (forceRegenerate && expressApp) {
        console.log('Generating new OpenAPI documentation from Express routes...');
        swaggerDocument = generateOpenAPIFromApp(expressApp);
        
        // Save to files
        const docsDir = path.join(__dirname, '../../docs');
        const yamlPath = path.join(docsDir, 'openapi.yaml');
        const jsonPath = path.join(docsDir, 'openapi.json');
        
        try {
          await fs.promises.mkdir(docsDir, { recursive: true });
          await fs.promises.writeFile(yamlPath, yaml.dump(swaggerDocument, { indent: 2 }));
          await fs.promises.writeFile(jsonPath, JSON.stringify(swaggerDocument, null, 2));
          console.log('OpenAPI files saved successfully!');
          allReadyForcedRegenerate = true;
        } catch (writeError: any) {
          console.warn('Could not save OpenAPI files:', writeError.message);
        }
        
      } else {
        // Try to load from existing files first
        const yamlPath = path.join(__dirname, '../../docs/openapi.yaml');
        try {
          const yamlContent = await fs.promises.readFile(yamlPath, 'utf8');
          swaggerDocument = yaml.load(yamlContent);
  } catch (fileError: any) {
          console.log('No existing OpenAPI file found, generating from Express app...');
          if (expressApp) {
            swaggerDocument = generateOpenAPIFromApp(expressApp);
            allReadyForcedRegenerate = true;
          } else {
            throw new Error('No Express app provided for generation');
          }
        }
      }
    } catch (error: any) {
      console.error('Error loading/generating OpenAPI:', error);
      swaggerDocument = {
        openapi: '3.0.0',
        info: {
          title: 'WhatsApp Multi-Platform API Gateway',
          version: '1.0.0',
          description: 'Error loading OpenAPI specification'
        },
        paths: {}
      };
    }
  }
  return swaggerDocument;
}

// Configure Swagger UI with customizations
const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { 
      background-color: #25D366; 
    }
    .swagger-ui .info .title { 
      color: #25D366; 
    }
    .swagger-ui .scheme-container { 
      background: #fafafa; 
      border: 1px solid #25D366; 
    }
  `,
  customSiteTitle: "WhatsApp Multi-Platform API Documentation",
  swaggerOptions: {
    tryItOutEnabled: true,
    persistAuthorization: true,
  requestInterceptor: (req: any) => {
      // Preserve Basic auth if Swagger UI already set it
      const existingAuth = req.headers?.Authorization || req.headers?.authorization;
      if (existingAuth && existingAuth.startsWith('Basic ')) {
        return req;
      }

      // Otherwise, if no Authorization yet, optionally apply Bearer from localStorage
      const token = (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('jwt_token')) || null;
      if (!existingAuth && token) {
        req.headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      }
      return req;
    }
  }
};

// Serve assets do Swagger UI
router.use('/', swaggerUi.serve);

/**
 * GET /docs
 * Serve Swagger UI
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const expressApp = req.app;
    const swaggerDoc = await generateAndLoadSwaggerDocument(!allReadyForcedRegenerate, expressApp);
    swaggerUi.setup(swaggerDoc, swaggerOptions)(req, res, next);
  } catch (error: any) {
    res.status(500).json({
      error: 'Error loading documentation',
      code: 'DOCS_LOAD_ERROR'
    });
  }
});


/**
 * GET /docs/openapi.json
 * Serve OpenAPI file
 */
router.get('/openapi.json', asyncHandler(async (req: Request, res: Response) => {
    try {
        const jsonPath = path.join(__dirname, '../../docs/openapi.json');
        const jsonContent = await fs.promises.readFile(jsonPath, 'utf8');

        res.set('Content-Type', 'application/json');
        return res.send(jsonContent).json();
    } catch (error: any) {
        res.status(404).json({
            error: 'OpenAPI file not found',
            code: 'OPENAPI_NOT_FOUND'
        });
    }
}));

/**
 * GET /docs/openapi.yaml
 * Serve OpenAPI file
 */
router.get('/openapi.yaml', asyncHandler(async (req: Request, res: Response) => {
  try {
    const yamlPath = path.join(__dirname, '../../docs/openapi.yaml');
    const yamlContent = await fs.promises.readFile(yamlPath, 'utf8');
    
    res.set('Content-Type', 'application/yaml');
    return res.send(yamlContent).json();
  } catch (error: any) {
    res.status(404).json({
      error: 'OpenAPI file not found',
      code: 'OPENAPI_NOT_FOUND'
    });
  }
}));

/**
 * GET /docs/generate
 * Regenerate OpenAPI documentation
 */
router.get('/generate', asyncHandler(async (req: Request, res: Response) => {
  try {
    console.log('Regenerating OpenAPI documentation...');
    swaggerDocument = null; // Clear cache
    const expressApp = req.app;
    await generateAndLoadSwaggerDocument(true, expressApp);
    
    res.json({
      success: true,
      message: 'OpenAPI documentation successfully regenerated',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error regenerating documentation:', error);
    res.status(500).json({
      error: 'Error regenerating documentation',
      code: 'DOCS_REGENERATION_ERROR',
      details: error.message
    });
  }
}));

export default router;
