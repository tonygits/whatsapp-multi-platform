import {Webhook} from "../types/webhook";
import database from "../database/database";
import logger from "../utils/logger";

class WebhookRepository {
    /**
     * Create a new webhook by payload
     * @returns {Promise<Object>} - Created webhook with ID
     * @param webhookData
     */
    async create(webhookData: any): Promise<Webhook> {
        try {
            const {
                webhookId,
                payload,
                status,
            } = webhookData;

            if (!webhookId) {
                throw new Error('webhook id is mandatory');
            }

            const result = await database.run(
                `INSERT INTO webhooks (id, payload, status)
                 VALUES (?, ?, ?)`,
                [
                    webhookId,
                    payload,
                    status,
                ]
            );

            const webhook = await database.get(
                `SELECT *
                 FROM webhooks
                 WHERE id = ?`,
                [webhookId]
            );
            logger.info(`webhook created: ${webhookId}`, {webhookId: webhookId, status: status});

            return {
                id: webhook.id,
                payload: webhook.payload,
                status: webhook.status,
                createdAt: webhook.created_at,
            };
        } catch (error) {
            logger.error('Error creating webhook:', error);
            throw error;
        }
    }

    /**
     * List webhooks
     * @returns {Promise<Object|null>} - Webhooks or null
     */
    async listWebhooks(): Promise<Webhook[]> {
        try {
            return database.all(
                'SELECT * FROM webhooks WHERE true ',
            )
        } catch (error) {
            logger.error('Error listing webhooks:', error);
            throw error;
        }
    }

    /**
     * Find webhook
     * @param {string} id - Webhooks id
     * @returns {Promise<Object|null>} - Webhook or null
     */
    async findById(id: string): Promise<any> {
        try {
            return await database.get(
                'SELECT * FROM webhooks WHERE id = ?',
                [id]
            );
        } catch (error) {
            logger.error('Error fetching webhook by id:', error);
            throw error;
        }
    }
}

export default new WebhookRepository();
