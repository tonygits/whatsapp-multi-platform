// src/producer.ts
import * as amqplib from 'amqplib';
import type { Connection, Channel, Options } from 'amqplib';
import {TaskMessage} from "../types/task_message";

let connection: any;
let channel: any;
let connecting = false;
let closed = false;

const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE_NAME = process.env.QUEUE_NAME || 'tasks_queue';
const RECONNECT_DELAY_MS = 5000;

// buffer messages if channel isn't ready
const pending: Array<{ msg: TaskMessage; resolve: () => void; reject: (e: any) => void }> = [];

/**
 * Create and maintain connection + channel.
 * Safe to call multiple times; subsequent calls will no-op while connecting.
 */
export async function initProducer(): Promise<void> {
    if (connecting || closed) return;
    connecting = true;

    while (!connection && !closed) {
        try {
            const conn = (await amqplib.connect(RABBIT_URL)) as any;
            connection = conn;

            connection.on('error', (err: any) => {
                // amqplib emits 'error' then 'close' for many problems
                console.error('[producer] connection error', err);
            });

            connection.on('close', () => {
                console.warn('[producer] connection closed');
                connection = null;
                channel = null;
                // try reconnect after a delay
                if (!closed) setTimeout(() => void initProducer(), RECONNECT_DELAY_MS);
            });

            // create channel
            const ch = await connection.createChannel();
            channel = ch;

            // ensure queue exists (durable)
            await channel.assertQueue(QUEUE_NAME, { durable: true });

            // flush any pending messages
            flushPending();

            console.log('[producer] connected and channel ready');
            break;
        } catch (err) {
            console.error('[producer] failed to connect/create channel, retrying in', RECONNECT_DELAY_MS, 'ms', err);
            // cleanup any partial state
            try { if (channel) await channel.close(); } catch {}
            try { if (connection) await connection.close(); } catch {}
            channel = null;
            connection = null;
            await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
        }
    }

    connecting = false;
}

/**
 * Send a TaskMessage to the configured queue.
 * If the channel isn't ready, message is buffered and will be sent when ready.
 */
export async function sendToQueue(msg: TaskMessage, options?: Options.Publish): Promise<void> {
    if (closed) throw new Error('Producer is closed');

    // ensure initialization started
    if (!connection || !channel) {
        // start init in background if not already
        void initProducer();

        // buffer the message until channel becomes available
        return new Promise((resolve, reject) => {
            pending.push({ msg, resolve, reject });
        });
    }

    return publish(channel, msg, options);
}

/** publish helper: handles backpressure (drain) */
async function publish(ch: Channel, msg: TaskMessage, options?: Options.Publish): Promise<void> {
    const payload = Buffer.from(JSON.stringify({
        ...msg,
        createdAt: msg.createdAt || new Date().toISOString()
    }));

    const ok = ch.sendToQueue(QUEUE_NAME, payload, { persistent: true, ...(options || {}) });
    if (!ok) {
        // wait for drain event
        await new Promise<void>((resolve) => {
            ch.once('drain', () => resolve());
        });
    }
    // done
}

/** flush buffered messages (called when channel becomes available) */
function flushPending() {
    if (!channel) return;
    // drain pending sequentially to preserve order
    while (pending.length > 0) {
        const item = pending.shift();
        if (!item) continue;
        publish(channel, item.msg)
            .then(item.resolve)
            .catch(item.reject);
    }
}

/** Close producer gracefully */
export async function closeProducer(): Promise<void> {
    closed = true;
    // stop buffering new messages
    if (channel) {
        try { await channel.close(); } catch (e) { /* ignore */ }
        channel = null;
    }
    if (connection) {
        try { await connection.close(); } catch (e) { /* ignore */ }
        connection = null;
    }
    // reject pending
    while (pending.length) {
        const p = pending.shift();
        if (p) p.reject(new Error('Producer closed before message was sent'));
    }
    console.log('[producer] closed');
}

/** Optional helper to check readiness */
export function isReady(): boolean {
    return !!(connection && channel);
}

/* Auto-init: if module run directly or imported, start connecting in background */
void initProducer();
