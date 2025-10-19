import path from 'path';
import fs from 'fs';

const explicitBase = process.env.APP_BASE_DIR;
const dockerBase = '/app';
const BASE_DIR = explicitBase
  ? explicitBase
  : fs.existsSync(dockerBase)
    ? dockerBase
    : process.cwd();

const DATA_DIR = path.join(BASE_DIR, 'data');

// Ensure directories exist
function ensureDirectoryExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Create directory structure
ensureDirectoryExists(DATA_DIR);
ensureDirectoryExists(path.join(DATA_DIR, 'sessions'));
ensureDirectoryExists(path.join(DATA_DIR, 'volumes'));

export const BIN_PATH = process.env.BIN_PATH || path.join(BASE_DIR, 'whatsapp');
export const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(DATA_DIR, 'sessions');
export const VOLUMES_DIR = path.join(DATA_DIR, 'volumes');
export { BASE_DIR, DATA_DIR };


