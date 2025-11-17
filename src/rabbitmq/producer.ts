// src/rabbit/producer.ts
import { getChannel } from "./connection";

const QUEUE_NAME = process.env.QUEUE_NAME || 'tasks_queue';

export async function publishToQueue(msg: any) {
    const channel = getChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    const buffer = Buffer.from(JSON.stringify(msg));
    channel.sendToQueue(QUEUE_NAME, buffer);

    console.log("📨 Sent to queue:", QUEUE_NAME, msg);
}
