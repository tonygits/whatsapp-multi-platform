import {Customer} from "../types/customer";
import database from "../database/database";
import logger from "../utils/logger";
import {Subscription} from "../types/subscription";

class SubscriptionRepository {
    /**
     * Create a new subscription by code
     * @returns {Promise<Object>} - Created subscription with ID
     * @param subscriptionData
     */
    async create(subscriptionData: any): Promise<Subscription> {
        try {
            const {
                id,
                code,
                customerId,
                email,
                planCode,
                status,
                nextBillingDate
            } = subscriptionData;

            if (!customerId) {
                throw new Error('customer code is mandatory');
            }

            const result = await database.run(
                `INSERT INTO subscriptions (id, code, customer_id, email, plan_code,
                                            status, next_billing_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    code,
                    customerId,
                    email,
                    planCode,
                    status,
                    nextBillingDate || null,
                ]
            );

            const subscription = await database.get(
                `SELECT *
                 FROM subscriptions
                 WHERE id = ?`,
                [id]
            );
            logger.info(`subscription created: ${id}`, {id: id, subscriptionCode: code});

            return {
                id: subscription.id,
                code: subscription.code,
                customerId: subscription.customer_id,
                email: subscription.email,
                planCode: subscription.plan_code,
                status: subscription.status,
                nextBillingDate: subscription.next_billing_date,
                createdAt: subscription.created_at,
                updatedAt: subscription.updated_at,
            };
        } catch (error) {
            logger.error('Error creating subscription:', error);
            throw error;
        }
    }

    /**
     * Find subscription by code
     * @returns {Promise<Object|null>} - Subscription or null
     * @param code
     */
    async findByCode(code: string): Promise<Subscription | null> {
        try {
            const subscription = await database.get(
                'SELECT * FROM subscriptions WHERE code = ?',
                [code]
            );

            if (!subscription) {
                return null
            }

            return {
                id: subscription.id,
                code: subscription.code,
                customerId: subscription.customer_id,
                email: subscription.email,
                planCode: subscription.plan_code,
                status: subscription.status,
                nextBillingDate: subscription.next_billing_date,
                createdAt: subscription.created_at,
                updatedAt: subscription.updated_at,
            };
        } catch (error) {
            logger.error('Error fetching customer by code:', error);
            throw error;
        }
    }

    /**
     * Find subscription by code
     * @returns {Promise<Object|null>} - Subscription or null
     * @param customerId
     * @param planCode
     */
    async findByCustomerIdAndPlanCode(customerId: string, planCode: string): Promise<Subscription | null> {
        try {
            const subscription = await database.get(
                'SELECT * FROM subscriptions WHERE customer_id = ? AND plan_code = ?',
                [customerId, planCode]
            );

            if (!subscription) {
                return null
            }

            return {
                id: subscription.id,
                code: subscription.code,
                customerId: subscription.customer_id,
                email: subscription.email,
                planCode: subscription.plan_code,
                status: subscription.status,
                nextBillingDate: subscription.next_billing_date,
                createdAt: subscription.created_at,
                updatedAt: subscription.updated_at,
            };
        } catch (error) {
            logger.error('Error fetching customer by customer id and plan code:', error);
            throw error;
        }
    }

    /**
     * Update device
     * @param code
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object|null>} - Updated subscription or null
     */
    async update(code: string, updateData: any): Promise<Subscription> {
        try {
            const allowedFields = [
                'status', 'next_billing_date'
            ];

            // Convert camelCase to snake_case for database
            const fieldMapping = {
                'status': 'status',
                'nextBillingDate': 'next_billing_date',
            };

            const fields = [];
            const params = [];

            for (const [key, value] of Object.entries(updateData)) {
                // Convert camelCase to snake_case if needed
                const dbField = (fieldMapping as any)[key] || key;

                if (allowedFields.includes(dbField)) {
                    fields.push(`${dbField} = ?`);
                    params.push(value);
                }
            }

            if (fields.length === 0) {
                throw new Error('No valid fields to update');
            }

            params.push(code);

            await database.run(
                `UPDATE subscriptions
                 SET ${fields.join(', ')}
                 WHERE code = ?`,
                params
            );

            // Get the updated device directly
            const updatedSubscription = await database.get(
                'SELECT * FROM subscriptions WHERE code = ?',
                [code]
            );
            logger.info(`Updated subscription: ${code}`);

            return {
                id: updatedSubscription.id,
                code: updatedSubscription.code,
                customerId: updatedSubscription.customer_id,
                email: updatedSubscription.email,
                planCode: updatedSubscription.plan_code,
                status: updatedSubscription.status,
                nextBillingDate: updatedSubscription.next_billing_date,
                createdAt: updatedSubscription.created_at,
                updatedAt: updatedSubscription.updated_at,
            };
        } catch (error) {
            logger.error('Error updating subscription:', error);
            throw error;
        }
    }
}

export default new SubscriptionRepository();
