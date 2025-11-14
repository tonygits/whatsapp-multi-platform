import {ApiRequest, ApiRequestCount} from "../types/api_request";
import database from "../database/database";
import logger from "../utils/logger";

class ApiRequestRepository {
    /**
     * Create a new device by device hash
     * @returns {Promise<Object>} - Created deviceKey with ID
     * @param apiRequestData
     */
    async create(apiRequestData: any): Promise<ApiRequest> {
        try {
            const {
                requestId,
                deviceHash,
                ipAddress,
                userAgent,
                userId,
                endpoint,
                method,
            } = apiRequestData;

            if (!deviceHash) {
                throw new Error('Device hash is mandatory');
            }

            const result = await database.run(
                `INSERT INTO api_requests (id, device_hash, ip_address, user_agent, user_id, endpoint, method)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    requestId,
                    deviceHash,
                    ipAddress,
                    userAgent,
                    userId,
                    endpoint,
                    method,
                ]
            );

            const apiRequest = await database.get(
                `SELECT *
                 FROM api_requests
                 WHERE id = ?`,
                [requestId]
            );
            logger.info(`api request created: ${requestId}`, {apiRequestId: requestId, deviceHash: deviceHash});

            return {
                id: apiRequest.id,
                deviceHash: apiRequest.device_hash,
                ipAddress: apiRequest.ip_address,
                userAgent: apiRequest.user_agent,
                userId: apiRequest.user_id,
                endpoint: apiRequest.endpoint,
                method: apiRequest.method,
                createdAt: apiRequest.created_at,
            };
        } catch (error) {
            logger.error('Error creating api request:', error);
            throw error;
        }
    }

    /**
     * Find device by phone number
     * @returns {Promise<Object|null>} - DeviceKey or null
     * @param filterData
     */
    async filterCount(filterData: any): Promise<ApiRequestCount | null> {
        const date = new Date();
        const formattedDate = date.toISOString().split('T')[0];
        console.log(formattedDate);
        try {
            const apiRequestCount = await database.get(
                'SELECT user_id, device_hash, COUNT(id) as count FROM api_requests WHERE device_hash = ? AND created_at >= ? AND created_at <= ?  ',
                [filterData.device_hash, filterData.start_date, filterData.end_date]
            );

            if (!apiRequestCount) {
                return null
            }

            return {
                userId: apiRequestCount.user_id,
                deviceHash: apiRequestCount.device_hash,
                count: apiRequestCount.count,
            };
        } catch (error) {
            logger.error('Error fetching api request count by date range:', error);
            throw error;
        }
    }

    /**
     * Get all apiRequests
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} - Array of apiRequests
     */
    async filterAll(filters: any = {}): Promise<any[]> {
        try {
            let sql = 'SELECT * FROM api_requests';
            const params = [];
            const conditions = [];

            if (filters.user_agent) {
                conditions.push('user_agent = ?');
                params.push(filters.user_agent);
            }

            if (filters.endpoint) {
                conditions.push('endpoint = ?');
                params.push(filters.endpoint);
            }

            if (filters.device_hash) {
                conditions.push('device_hash = ?');
                params.push(filters.device_hash);
            }

            if (filters.method) {
                conditions.push('method = ?');
                params.push(filters.method);
            }

            if (filters.user_id) {
                conditions.push('user_id = ?');
                params.push(filters.user_id);
            }

            if (conditions.length > 0) {
                sql += ' WHERE ' + conditions.join(' AND ');
            }

            sql += ' ORDER BY created_at DESC';

            return await database.all(sql, params);
        } catch (error) {
            logger.error('Error listing api_requests:', error);
            throw error;
        }
    }
}

export default new ApiRequestRepository();
