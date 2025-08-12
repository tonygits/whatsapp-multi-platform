-- WhatsApp Multi-Platform Database Schema

-- Tabela de dispositivos WhatsApp
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_hash VARCHAR(16) NOT NULL UNIQUE,
    container_id VARCHAR(100),
    container_port INTEGER,
    status VARCHAR(20) DEFAULT 'disconnected',
    webhook_url TEXT,
    webhook_secret TEXT,
    status_webhook_url TEXT,
    status_webhook_secret TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME
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

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_devices_hash ON devices(device_hash);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_messages_device ON messages(device_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

-- Trigger removido temporariamente para evitar problemas de parsing
-- Será adicionado via código JavaScript se necessário
