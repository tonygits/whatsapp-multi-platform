import amqplib, {Connection, Channel, ConsumeMessage} from 'amqplib';
import {TaskMessage} from "../types/task_message";
import {getChannel} from "./connection";
import {createApiRequests, doOtherTask, sendUserEmail} from "./operations";
import dotenv from "dotenv";

const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE_NAME = process.env.QUEUE_NAME || 'tasks_queue';

dotenv.config();

export async function startConsumer() {
    const channel = getChannel();

    const queue = QUEUE_NAME;
    await channel.assertQueue(queue, {durable: true});

    channel.consume(queue, async (msg) => {
        if (!msg) return;

        let payload: TaskMessage;
        try {
            payload = JSON.parse(msg.content.toString()) as TaskMessage;
        } catch (err) {
            console.error('[consumer] Invalid JSON, acking to discard', err);
            channel.ack(msg);
            return;
        }

        console.log("📩 Received:", payload);

        // Switch-case to process operations
        let result;
        switch (payload.type) {
            case 'apiRequest':
                result = await createApiRequests(payload.id, payload.payload);
                break;

            case 'email':
                result = await sendUserEmail(payload.id, payload.payload);
                break;

            case 'other':
                result = await doOtherTask(payload.payload);
                break;

            default:
                console.warn('[consumer] Unknown message type:', payload.type);
                channel.ack(msg);
                return;
        }
        channel.ack(msg);
    });

    console.log("👀 Consumer running...");
}
