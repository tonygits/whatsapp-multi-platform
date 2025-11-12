import amqplib, { Connection, Channel, ConsumeMessage } from 'amqplib';
import {TaskMessage} from "../types/task_message";
import {doOtherTask, processOrder} from "./operations";

const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE_NAME = process.env.QUEUE_NAME || 'tasks_queue';
const PREFETCH = Number(process.env.PREFETCH || '5');
const RECONNECT_DELAY_MS = 5000;

let conn: any;
let ch: any;

async function handleMessage(msg: ConsumeMessage | null) {
    if (!msg || !ch) return;
    let payload: TaskMessage;
    try {
        payload = JSON.parse(msg.content.toString()) as TaskMessage;
    } catch (err) {
        console.error('[consumer] Invalid JSON, acking to discard', err);
        ch.ack(msg);
        return;
    }

    try {
        let result;
        switch (payload.type) {
            case 'processOrder':
                result = await processOrder(payload.id, payload.payload);
                break;
            case 'otherTask':
                result = await doOtherTask(payload.payload);
                break;
            default:
                console.warn('[consumer] Unknown message type:', payload.type);
                ch.ack(msg);
                return;
        }
        console.log('[consumer] task result:', result);
        ch.ack(msg);
    } catch (err) {
        console.error('[consumer] worker error', err);
        // nack without requeue - in production hook DLX or implement retry count
        ch.nack(msg, false, false);
    }
}

async function setupChannel(connection: any) {
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    channel.prefetch(PREFETCH);
    channel.consume(QUEUE_NAME, (m: any) => {
        handleMessage(m).catch(err => {
            console.error('[consumer] handleMessage failed', err);
        });
    }, { noAck: false });
    return channel;
}

async function startConsumer() {
    while (true) {
        try {
            console.log('[consumer] connecting to', RABBIT_URL);
            conn = await amqplib.connect(RABBIT_URL);
            conn.on('error', (err: any) => {
                console.error('[consumer] connection error', err);
            });
            conn.on('close', () => {
                console.warn('[consumer] connection closed, will attempt reconnect');
            });

            ch = await setupChannel(conn);
            console.log(`[consumer] waiting for messages in ${QUEUE_NAME} (prefetch=${PREFETCH})`);
            // break loop so we keep channel open; reconnection handled by 'close' events below
            break;
        } catch (err) {
            console.error('[consumer] connection failed, retrying in', RECONNECT_DELAY_MS, 'ms', err);
            await new Promise(res => setTimeout(res, RECONNECT_DELAY_MS));
        }
    }

    // react to connection close by trying to reconnect
    if (conn) {
        conn.on('close', async () => {
            console.log('[consumer] detected connection close, reconnecting...');
            conn = null;
            ch = null;
            await startConsumer();
        });
    }
}

// start directly with `ts-node src/consumer.ts` or via npm script
if (require.main === module) {
    startConsumer().catch(err => {
        console.error('Failed to start consumer', err);
        process.exit(1);
    });
}

export { startConsumer };
