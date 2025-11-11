import {ApiRequest} from "../types/api_request";
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
                `SELECT * FROM api_requests WHERE id = ?`,
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

}
export default new ApiRequestRepository();
