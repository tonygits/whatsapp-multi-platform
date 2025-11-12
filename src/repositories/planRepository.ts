import {DeviceKey} from "../types/deviceKey";
import database from "../database/database";
import logger from "../utils/logger";
import {Plan} from "../types/plan";

class PlanRepository {

    /**
     * Create a new plan by plan code
     * @returns {Promise<Object>} - Created plan with ID
     * @param planData
     */
    async create(planData: any): Promise<Plan> {
        try {
            const {
                id,
                code,
                name,
                description,
                amount,
                interval,
            } = planData;

            if (!code) {
                throw new Error('plan code is mandatory');
            }

            const result = await database.run(
                `INSERT INTO plans (id, code, name, description, amount, interval)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    code,
                    name,
                    description,
                    amount,
                    interval,
                ]
            );

            const plan = await database.get(
                `SELECT * FROM plans WHERE id = ?`,
                [id]
            );
            logger.info(`plan created: ${id}`, {planId: id, code: code});

            return {
                id: plan.id,
                code: plan.code,
                name: plan.name,
                description: plan.description,
                amount: plan.amount,
                interval: plan.interval,
                createdAt: plan.created_at,
                updatedAt: plan.updated_at,
            };
        } catch (error) {
            logger.error('Error creating plan:', error);
            throw error;
        }
    }

    /**
     * List plans
     * @returns {Promise<Object|null>} - Plans or null
     */
    async listPlans(): Promise<any[]> {
        try {
            return database.all(
                'SELECT * FROM plans WHERE true '
            )
        } catch (error) {
            logger.error('Error listing plans:', error);
            throw error;
        }
    }

    /**
     * Find plan by code
     * @returns {Promise<Object|null>} - Plan or null
     * @param code
     */
    async findByCode(code: string): Promise<Plan | null> {
        try {
            const plan = await database.get(
                'SELECT * FROM plans WHERE code = ?',
                [code]
            );

            if (!plan) {
                return null
            }

            return {
                id: plan.id,
                code: plan.code,
                name: plan.name,
                description: plan.description,
                amount: plan.amount,
                interval: plan.interval,
                createdAt: plan.created_at,
                updatedAt: plan.updated_at,
            };
        } catch (error) {
            logger.error('Error fetching customer by code:', error);
            throw error;
        }
    }
}
export default new PlanRepository();
