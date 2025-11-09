import {Customer} from "../types/customer";
import database from "../database/database";
import logger from "../utils/logger";

class CustomerRepository {
    /**
     * Create a new customer by code
     * @returns {Promise<Object>} - Created customer with ID
     * @param customerData
     */
    async create(customerData: any): Promise<Customer> {
        try {
            const {
                id,
                authorizationCode,
                customerId,
                firstName,
                email,
                lastName,
                phone,
            } = customerData;

            if (!customerId) {
                throw new Error('customer code is mandatory');
            }

            const result = await database.run(
                `INSERT INTO customers (id, authorization_code, customer_id,
                      first_name, email, last_name, phone) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    authorizationCode,
                    customerId,
                    firstName || null,
                    email,
                    lastName || null,
                    phone || null,
                ]
            );

            const customer = await database.get(
                `SELECT *
                 FROM customers
                 WHERE id = ?`,
                [id]
            );
            logger.info(`customer created: ${id}`, {id: id, customerId: customerId});

            return {
                id: customer.id,
                authorizationCode: customer.authorization_code,
                customerId: customer.customer_id,
                firstName: customer.first_name,
                email: customer.email,
                lastName: customer.last_name,
                phone: customer.plan,
                createdAt: customer.created_at,
                updatedAt: customer.updated_at,
            };
        } catch (error) {
            logger.error('Error creating customer:', error);
            throw error;
        }
    }

    /**
     * Find customer by code
     * @returns {Promise<Object|null>} - Customer or null
     * @param code
     */
    async findByCode(code: string): Promise<Customer | null> {
        try {
            const customer = await database.get(
                'SELECT * FROM customers WHERE code = ?',
                [code]
            );

            if (!customer) {
                return null
            }

            return {
                id: customer.id,
                authorizationCode: customer.authorization_code,
                customerId: customer.customer_id,
                firstName: customer.first_name,
                email: customer.email,
                lastName: customer.last_name,
                phone: customer.plan,
                createdAt: customer.created_at,
                updatedAt: customer.updated_at,
            };
        } catch (error) {
            logger.error('Error fetching customer by code:', error);
            throw error;
        }
    }

    /**
     * Find customer by code
     * @returns {Promise<Object|null>} - Customer or null
     * @param email
     */
    async findByEmail(email: string): Promise<Customer | null> {
        try {
            const customer = await database.get(
                'SELECT * FROM customers WHERE email = ?',
                [email]
            );

            if (!customer) {
                return null
            }

            return {
                id: customer.id,
                authorizationCode: customer.authorization_code,
                customerId: customer.customer_id,
                firstName: customer.first_name,
                email: customer.email,
                lastName: customer.last_name,
                phone: customer.plan,
                createdAt: customer.created_at,
                updatedAt: customer.updated_at,
            };
        } catch (error) {
            logger.error('Error fetching customer by email:', error);
            throw error;
        }
    }

    /**
     * Get all customers
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} - Array of customers
     */
    async filterAll(filters: any = {}): Promise<any[]> {
        try {
            let sql = 'SELECT * FROM customers';
            const params = [];
            const conditions = [];

            if (filters.email) {
                conditions.push('email = ?');
                params.push(filters.email);
            }

            if (filters.firstName) {
                conditions.push('first_name = ?');
                params.push(filters.firstName);
            }

            if (filters.lastName) {
                conditions.push('last_name = ?');
                params.push(filters.lastName);
            }

            if (filters.phone) {
                conditions.push('phone = ?');
                params.push(filters.phone);
            }

            if (conditions.length > 0) {
                sql += ' WHERE ' + conditions.join(' AND ');
            }
            sql += ' ORDER BY created_at DESC';

            return await database.all(sql, params);
        } catch (error) {
            logger.error('Error listing customers:', error);
            throw error;
        }
    }
}

export default new CustomerRepository();
