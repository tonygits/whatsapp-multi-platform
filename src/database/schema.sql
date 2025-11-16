-- WhatsApp Multi-Platform Database Schema

-- WhatsApp user table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(150) PRIMARY KEY,
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

-- WhatsApp device table
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id VARCHAR(150) NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
-- Trigger temporarily removed to avoid parsing issues
-- Will be added via JavaScript code if necessary

--WhatsApp session table
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(150) PRIMARY KEY,
    user_id VARCHAR(150) NOT NULL,
    deactivated_at DATETIME,
    user_agent TEXT NOT NULL,
    ip_address VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS device_keys (
    id VARCHAR(150) PRIMARY KEY,
    user_id VARCHAR(150) NOT NULL,
    deactivated_at DATETIME,
    device_hash VARCHAR(150) NOT NULL,
    api_key_id TEXT NOT NULL,
    encrypted_token TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_keys_user_device_deactivated_at ON device_keys(user_id, device_hash, deactivated_at) WHERE deactivated_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_keys_api_key ON device_keys(api_key_id);

CREATE TABLE IF NOT EXISTS device_states (
    id VARCHAR(150) PRIMARY KEY,
    device_id INTEGER NOT NULL,
    device_hash VARCHAR(150) NOT NULL,
    user_id VARCHAR(150) NOT NULL,
    status VARCHAR(150) NOT NULL,
    payment_period INTEGER NOT NULL,
    period_type VARCHAR(150) NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    last_payment_date DATETIME,
    next_payment_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_states_device_hash ON device_states(device_hash);

CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(150) PRIMARY KEY,
    access_code VARCHAR(150),
    transaction_reference VARCHAR(150) NOT NULL,
    amount NUMERIC(11,2) NOT NULL,
    call_back_url  VARCHAR(150),
    currency VARCHAR(50) NOT NULL,
    description TEXT,
    merchant_request_id VARCHAR(150),
    checkout_request_id VARCHAR(150),
    payment_mode VARCHAR(150) NOT NULL,
    phone_number VARCHAR(150),
    email VARCHAR(150),
    resource_id VARCHAR(150) NOT NULL,
    resource_name VARCHAR(150) NOT NULL,
    resource_type VARCHAR(150) NOT NULL,
    transaction_id VARCHAR(150) NOT NULL,
    status VARCHAR(150) NOT NULL,
    user_id VARCHAR(150) NOT NULL,
    transaction_date VARCHAR(150),
    paystack_response TEXT,
    mpesa_stk_push_response TEXT,
    is_recurring BOOLEAN NOT NULL DEFAULT true,
    payment_period VARCHAR(150) NOT NULL,
    period_type VARCHAR(150) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transaction_reference ON payments(transaction_reference);

CREATE TABLE IF NOT EXISTS device_payments (
    id VARCHAR(150) PRIMARY KEY,
    device_id INTEGER NOT NULL,
    device_hash VARCHAR(150) NOT NULL,
    payment_id VARCHAR(150) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_payments_device_hash_payment_id ON device_payments(device_hash, payment_id);

CREATE TABLE IF NOT EXISTS plans (
    id VARCHAR(150) PRIMARY KEY,
    name period VARCHAR(150) NOT NULL,
    code VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(11,2) NOT NULL,
    interval VARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS plans_code_uniq_idx ON plans(code);

CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(150) PRIMARY KEY,
    authorization_code VARCHAR(150),
    first_name VARCHAR(150),
    last_name VARCHAR(150),
    customer_id  VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    device_hash VARCHAR(150) NOT NULL,
    user_id VARCHAR(150) NOT NULL,
    phone VARCHAR(150),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_id_uniq_idx ON customers(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_uniq_idx ON customers(email);

CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(150) PRIMARY KEY,
    code VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    customer_id VARCHAR(150) NOT NULL,
    plan_code VARCHAR(150) NOT NULL,
    status  VARCHAR(150) NOT NULL,
    next_billing_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_code_uniq_idx ON subscriptions(code);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_customer_plan_uniq_idx ON subscriptions(customer_id, plan_code);

CREATE TABLE IF NOT EXISTS webhooks (
    id VARCHAR(150) PRIMARY KEY,
    payload TEXT NOT NULL,
    status VARCHAR(150) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_requests (
    id VARCHAR(150) PRIMARY KEY,
    user_id VARCHAR(150) NOT NULL,
    device_hash VARCHAR(150) NOT NULL,
    ip_address VARCHAR(150) NOT NULL,
    user_agent TEXT NOT NULL,
    endpoint VARCHAR(150) NOT NULL,
    method VARCHAR(150) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS api_requests_user_device_idx ON api_requests(user_id, device_hash);

-- Add device_hash column to subscriptions table
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS  device_hash VARCHAR(150) NOT NULL DEFAULT '';
