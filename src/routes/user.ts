import 'dotenv/config';
import express, {Request, Response, NextFunction} from 'express';
import {
    getUserByEmail, getUserById,
    initiateEmailVerification, listUsers,
    verifyUserEmail
} from "../services/userService";

const router = express.Router();

// Optional: POST /initiate_email_verification
router.get('/', async (req: Request, res: Response) => {
    try {
        const users = await listUsers();
        res.status(200).json({users});
    } catch (err: any) {
        console.error('initiate_email_verification error', err);
        res.status(400).json({error: err.message ?? 'Failed to initiate email verification'});
    }
});

// Optional: POST /initiate_email_verification
router.get('/user_by_email', async (req: Request, res: Response) => {
    try {
        const {email} = req.query as { email?: string };
        if (!email) return res.status(400).json({error: 'email is required'});
        const user = await getUserByEmail(email);
        res.status(200).json({user});
    } catch (err: any) {
        console.error('initiate_email_verification error', err);
        res.status(400).json({error: err.message ?? 'Failed to initiate email verification'});
    }
});

// Optional: POST /get user by id
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const {id} = req.params as { id?: string };
        if (!id) return res.status(400).json({error: 'id is required'});
        const user = await getUserById(id);
        res.status(200).json({user});
    } catch (err: any) {
        console.error('get user by id error', err);
        res.status(400).json({error: err.message ?? 'Failed to get user by id'});
    }
});

// Optional: POST /initiate_email_verification
router.get('/initiate_email_verification', async (req: Request, res: Response) => {
    try {
        const {email} = req.query as { email?: string };
        if (!email) return res.status(400).json({error: 'email is required'});
        const user = await initiateEmailVerification(email);
        res.status(200).json({user});
    } catch (err: any) {
        console.error('initiate_email_verification error', err);
        res.status(400).json({error: err.message ?? 'Failed to initiate email verification'});
    }
});

// Optional: POST /reset_password
router.put('/:id/verify_email', async (req: Request, res: Response) => {
    try {
        const {id} = req.params as { id: string };
        const {code} = req.query as { code: string };
        if (!id) return res.status(400).json({error: 'user id is required'});
        const user = await verifyUserEmail(id, code);
        res.status(200).json({user});
    } catch (err: any) {
        console.error('verify user email error', err);
        res.status(400).json({error: err.message ?? 'Failed to verify user email'});
    }
});

export default router;
