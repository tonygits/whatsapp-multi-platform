import 'dotenv/config';
import express, {Request, Response, NextFunction} from 'express';
import {deleteSession, getSessionById, listSessionsForUser} from "../services/sessionService";
import {AuthenticatedRequest} from "../types/session";
import {asyncHandler} from "../middleware/errorHandler";
import {createApiToken, revokeKey} from "../utils/encryption";
import deviceKeyRepository from "../repositories/DeviceKeyRepository";

const router = express.Router();

// Optional: POST /list sessions
router.get('/users/:id', async (req: Request, res: Response) => {
    try {
        const {id} = req.params as { id: string };
        if (!id) return res.status(400).json({error: 'user id is required'});
        const sessions = await listSessionsForUser(id);
        res.status(200).json({sessions});
    } catch (err: any) {
        console.error('failed to list sessions with error', err);
        res.status(400).json({error: err.message ?? 'Failed to list sessions for user'});
    }
});

router.post('/device_keys', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const {device_hash} = req.body as { device_hash: string };
        if (!device_hash) return res.status(400).json({error: 'user id is required'});
        const userId = req.user?.userId as string
        const clientToken = await createApiToken(userId, device_hash);
        res.status(201).json({access_token: clientToken, message: 'api key created. Store the key as you will not access it again.'});
    } catch (err: any) {
        console.error('failed to create device key with error', err);
        res.status(400).json({error: err.message ?? 'failed to create device key for device'});
    }
}));

// Optional: POST /get session by id
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const {id} = req.params as { id: string };
        if (!id) return res.status(400).json({error: 'session id is required'});
        const session = await getSessionById(id);
        res.status(200).json({session});
    } catch (err: any) {
        console.error('failed to get session by id with error', err);
        res.status(400).json({error: err.message ?? 'failed to get session by id'});
    }
});

// Optional: POST /logout user
router.delete('/:id/logout', async (req: Request, res: Response) => {
    try {
        const {id} = req.params as { id?: string };
        if (!id) return res.status(400).json({error: 'session id is required'});
        const user = await deleteSession(id);
        res.status(200).json({user});
    } catch (err: any) {
        console.error('failed to logout user with error', err);
        res.status(400).json({error: err.message ?? 'failed to logout user'});
    }
});

router.get('/users/:id/devices', async (req: Request, res: Response) => {
    try {
        const {id} = req.params as { id?: string };
        const {hash} = req.query as { hash?: string };
        if (!id) return res.status(400).json({error: 'user id is required'});
        if (!hash) return res.status(400).json({error: 'device hash id is required'});
        const deviceKey: any = await deviceKeyRepository.findByUserIdAndDeviceId(id, hash);
        if (!deviceKey){
            res.status(404).json({message: "device key not found"});
        }
        const {encryptedToken: deviceToken, ...deviceKeyWithoutToken} = deviceKey
        res.status(200).json({deviceKey: deviceKeyWithoutToken});
    } catch (err: any) {
        console.error('failed to deactivate device key with error', err);
        res.status(400).json({error: err.message ?? 'failed to deactivate device key'});
    }
});

router.delete('/device_keys/:id', async (req: Request, res: Response) => {
    try {
        const {id} = req.params as { id?: string };
        if (!id) return res.status(400).json({error: 'device key id is required'});
        const deviceKey = await revokeKey(id);
        res.status(200).json({deviceKey});
    } catch (err: any) {
        console.error('failed to deactivate device key with error', err);
        res.status(400).json({error: err.message ?? 'failed to deactivate device key'});
    }
});
 export default router;
