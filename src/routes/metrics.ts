import express, {Request, Response} from 'express';
import {asyncHandler} from "../middleware/errorHandler";
import logger from "../utils/logger";
import {AuthenticatedRequest} from "../types/session";
import apiRequestRepository from "../repositories/ApiRequestRepository";

const router = express.Router();
/**
 * POST /api/devices/stop *  device container by instance ID
 */
router.get('/api_requests/count', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    console.log('Received request to get metrics for device');
    const {number_hash} = req.query as { number_hash?: string };
    const {start_date} = req.query as { start_date?: string };
    const {end_date} = req.query as { end_date?: string };

    logger.info(`Querying metrics for ${number_hash}`);

    const apiRequestsCount = await apiRequestRepository.filterCount({
        device_hash: number_hash,
        start_date: start_date,
        end_date: end_date
    });

    res.status(200).json({api_requests_count: apiRequestsCount});
}));

export default router;
