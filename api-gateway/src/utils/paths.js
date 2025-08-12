const path = require('path');
const fs = require('fs');

// Decide base directory
// Priority: env APP_BASE_DIR -> '/app' if exists -> project root (dev)
const explicitBase = process.env.APP_BASE_DIR;
const dockerBase = '/app';
// __dirname = api-gateway/src/utils → subir três níveis para a raiz do projeto
const projectRoot = path.resolve(__dirname, '..', '..', '..');

const BASE_DIR = explicitBase
  ? explicitBase
  : fs.existsSync(dockerBase)
    ? dockerBase
    : projectRoot;

// Standardized paths
const BIN_PATH = path.join(BASE_DIR, 'whatsapp');
const SESSIONS_DIR = path.join(BASE_DIR, 'sessions');
const VOLUMES_DIR = path.join(BASE_DIR, 'volumes');

module.exports = {
  BASE_DIR,
  BIN_PATH,
  SESSIONS_DIR,
  VOLUMES_DIR,
};


