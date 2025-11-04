import 'dotenv/config';
import express, {Request, Response, NextFunction} from 'express';
import {
    getUserByEmail, getUserById,
    initiateEmailVerification, listUsers,
    verifyUserEmail
} from "../services/userService";

const router = express.Router();

// Optional: POST /list users
router.get('/', async (req: Request, res: Response) => {
    try {
        const users = await listUsers();
        res.status(200).json({users});
    } catch (err: any) {
        console.error('list users error', err);
        res.status(400).json({error: err.message ?? 'Failed to list users'});
    }
});

// Optional: POST /get user by email
router.get('/user/user_by_email', async (req: Request, res: Response) => {
    try {
        const {email} = req.query as { email?: string };
        if (!email) return res.status(400).json({error: 'email is required'});
        const user = await getUserByEmail(email);
        if (!user){
            res.status(404).json({message: "user not found"});
        }
        res.status(200).json({user});
    } catch (err: any) {
        console.error('user by email error', err);
        res.status(400).json({error: err.message ?? 'Failed to get user by email'});
    }
});

// Optional: POST /get user by id
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const {id} = req.params as { id?: string };
        if (!id) return res.status(400).json({error: 'id is required'});
        const user = await getUserById(id);
        if (!user){
            res.status(404).json({message: "user not found"});
        }
        res.status(200).json({user});
    } catch (err: any) {
        console.error('get user by id error', err);
        res.status(400).json({error: err.message ?? 'Failed to get user by id'});
    }
});

// Optional: POST /initiate_email_verification
router.get('/user/initiate_email_verification', async (req: Request, res: Response) => {
    try {
        const {email} = req.query as { email?: string };
        if (!email) return res.status(400).json({error: 'email is required'});
        const user = await initiateEmailVerification(email);
        if (!user){
            res.status(404).json({message: "user not found"});
        }
        res.status(200).json({user: user});
    } catch (err: any) {
        console.error('initiate email verification error', err);
        res.status(400).json({error: err.message ?? 'Failed to initiate email verification'});
    }
});

// Optional: POST /verify email
router.put('/:id/verify_email', async (req: Request, res: Response) => {
    try {
        const {id} = req.params as { id: string };
        const {code} = req.query as { code: string };
        if (!id) return res.status(400).json({error: 'user id is required'});
        const user = await verifyUserEmail(id, code);
        if (!user){
            res.status(404).json({message: "user not found"});
        }
        res.status(200).json({user});
    } catch (err: any) {
        console.error('verify user email error', err);
        res.status(400).json({error: err.message ?? 'Failed to verify user email'});
    }
});

export default router;
