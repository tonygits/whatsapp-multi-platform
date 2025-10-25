import 'dotenv/config';
import express, {Request, Response, NextFunction} from 'express';
import {deleteSession, getSessionById, listSessionsForUser} from "../services/sessionService";

const router = express.Router();

// Optional: POST /list sessions
router.get('/users/:id/sessions', async (req: Request, res: Response) => {
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

// Optional: POST /get session by id
router.get('/sessions/:id', async (req: Request, res: Response) => {
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
router.delete('/sessions/:id/logout', async (req: Request, res: Response) => {
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
 export default router;
