-- WhatsApp Multi-Platform Database Schema

-- WhatsApp device table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email VARCHAR(250) NOT NULL UNIQUE,
    name VARCHAR(200),
    first_name VARCHAR(150),
    last_name VARCHAR(150),
    contact_phone VARCHAR(150),
    picture TEXT,
    locale TEXT,
    password_hash TEXT,
    is_verified BOOLEAN DEFAULT false,
    verification_code TEXT,
    verification_code_expires DATETIME,
    reset_token TEXT,
    reset_token_expires DATETIME,
    provider VARCHAR(150),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    deactivated_at DATETIME,
    user_agent TEXT NOT NULL UNIQUE,
    ip_address ARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp device table
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_hash VARCHAR(16) NOT NULL UNIQUE,
    container_id VARCHAR(100),
    container_port INTEGER,
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'disconnected',
    webhook_url TEXT,
    webhook_secret TEXT,
    status_webhook_url TEXT,
    status_webhook_secret TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME
);

-- Message table (history/log)
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

-- Performance indices
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_hash ON devices(device_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_phone_number ON devices(phone_number);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_messages_device ON messages(device_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
-- Trigger temporarily removed to avoid parsing issues
-- Will be added via JavaScript code if necessary
