// src/rabbit.ts
import * as amqp from "amqplib";

export type AmqpResources = {
    conn: any;
    ch: amqp.Channel;
};

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";

export async function connectRabbit(url = RABBITMQ_URL, retryMs = 2000, maxAttempts = 5): Promise<AmqpResources> {
    let attempt = 0;
    while (true) {
        try {
            const conn = await amqp.connect(url);
            // prefer a regular channel for simple producer/consumer
            const ch = await conn.createChannel();
            // handle connection closed/error
            conn.on("error", (err) => {
                console.error("AMQP connection error", err);
            });
            conn.on("close", () => {
                console.warn("AMQP connection closed");
            });
            return { conn, ch };
        } catch (err) {
            attempt++;
            console.error(`AMQP connect attempt ${attempt} failed:`, (err as Error).message);
            if (attempt >= maxAttempts) throw err;
            await new Promise((r) => setTimeout(r, retryMs));
        }
    }
}
