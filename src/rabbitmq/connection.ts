// src/rabbit/connection.ts
import amqplib, {Connection, Channel} from "amqplib";

let connection: any;
let channel: any;

const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

export async function initRabbit() {
    if (connection) return {connection, channel}; // already initialized

    connection = await amqplib.connect(RABBIT_URL);
    channel = await connection.createChannel();

    console.log("🐰 RabbitMQ connected!");
    return {connection, channel};
}

export function getChannel(): Channel {
    if (!channel) {
        throw new Error("RabbitMQ channel not initialized! Call initRabbit() first.");
    }
    return channel;
}
