-- WhatsApp Multi-Platform Database Schema

-- Tabela de usuários do sistema
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    active BOOLEAN DEFAULT 1
);

-- Tabela de dispositivos WhatsApp
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_hash VARCHAR(16) NOT NULL UNIQUE,
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    phone_hash VARCHAR(64),
    name VARCHAR(100),
    session_id VARCHAR(100) UNIQUE,
    container_id VARCHAR(100),
    container_port INTEGER,
    status VARCHAR(20) DEFAULT 'disconnected',
    qr_code TEXT,
    qr_expires_at DATETIME,
    webhook_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME,
    user_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Tabela de mensagens (histórico/log)
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    message_id VARCHAR(100),
    chat_id VARCHAR(100),
    from_number VARCHAR(20),
    to_number VARCHAR(20),
    message_type VARCHAR(20),
    content TEXT,
    media_url TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'sent',
    webhook_delivered BOOLEAN DEFAULT 0,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Tabela de sessões/tokens
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_devices_hash ON devices(device_hash);
CREATE INDEX IF NOT EXISTS idx_devices_phone ON devices(phone_number);
CREATE INDEX IF NOT EXISTS idx_devices_phone_hash ON devices(phone_hash);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_device ON messages(device_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Trigger removido temporariamente para evitar problemas de parsing
-- Será adicionado via código JavaScript se necessário