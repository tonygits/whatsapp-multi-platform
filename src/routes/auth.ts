import 'dotenv/config';
import express, {Request, Response, NextFunction} from 'express';
import {verifyIdTokenAndUpsertUser, exchangeCodeAndProcess} from '../services/google';
import {signJwt} from '../utils/jwt';
import {initiateResetPassword, loginUser, setNewPassword, registerNewUser, User} from "../services/userService";
import crypto from "crypto";
import {hashPassword} from "../utils/password";

const router = express.Router();

// POST /auth/google - client sends idToken received from Google Identity Services
router.post('/google', async (req: Request, res: Response) => {
    try {
        const {idToken} = req.body as { idToken?: string };
        if (!idToken) return res.status(400).json({error: 'idToken is required'});

        const user = await verifyIdTokenAndUpsertUser(idToken);
        // sign app JWT (you might include roles, scopes, etc.)
        const token = signJwt({sub: user.id});

        res.json({token, user});
    } catch (err: any) {
        console.error('auth/google error', err);
        res.status(401).json({error: err.message ?? 'Invalid token'});
    }
});

// Optional: POST /auth/google/code - server-side exchange of authorization code
// (useful if your UI does server-side auth, or you need refresh tokens server-side)
router.post('/google/code', async (req: Request, res: Response) => {
    try {
        const {code} = req.body as { code?: string };
        if (!code) return res.status(400).json({error: 'code is required'});
        const {user} = await exchangeCodeAndProcess(code);
        const token = signJwt({sub: user.id});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('access_token', token)
        res.status(200).json(user);
    } catch (err: any) {
        console.error('auth/google/code error', err);
        res.status(400).json({error: err.message ?? 'Failed to exchange code'});
    }
});

// Optional: POST /login
router.post('/login', async (req: Request, res: Response) => {
    try {
        const {email, password} = req.body as { email: string, password: string };
        if (!email) return res.status(400).json({error: 'email is required'});
        if (!password) return res.status(400).json({error: 'password is required'});

        //login user
        const resp = await loginUser(email, password);
        const {token, user} = resp;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('access_token', token);
        res.status(200).json({user});
    } catch (err: any) {
        console.error('initiate_reset_password error', err);
        res.status(400).json({error: err.message ?? 'Failed to initiate reset password'});
    }
});

// Optional: POST /register user
router.post('/register', async (req: Request, res: Response) => {
    console.log("register user called")
    try {
        const {email, password, confirm_password, first_name, last_name, contact_phone} = req.body as {
            email: string, password: string, confirm_password: string, first_name?: string,
            last_name?: string, contact_phone?: string};
        if (!email) return res.status(400).json({error: 'email is required'});
        if (!password) return res.status(400).json({error: 'password is required'});
        if (!confirm_password) return res.status(400).json({error: 'confirm password is required'});

        if (password !== confirm_password) {
            return res.status(400).json({error: 'passwords do not match'});
        }

        let name: string | undefined
        if (first_name && last_name) {
            name = `${first_name} ${last_name}`
        }

        const userId = crypto.randomBytes(16).toString('hex');
        const passwordHash = await hashPassword(password);

        const user: Partial<User> = {
            id: userId,
            email: email,
            firstName: first_name ?? undefined,
            lastName: last_name ?? undefined,
            contactPhone: contact_phone ?? undefined,
            name: name,
            passwordHash: passwordHash,
            provider: 'application'
        };

        //login user
        const newUser = await registerNewUser(user);
        const token = signJwt({sub: newUser.id, name: newUser.name, admin: true, iss: newUser.email});
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('access_token', token);
        res.status(200).json({user: newUser});
    } catch (err: any) {
        console.error('failed to register user with error', err);
        res.status(400).json({error: err.message ?? 'failed to register user'});
    }
});

// Optional: POST /initiate_reset_password
router.get('/initiate_reset_password', async (req: Request, res: Response) => {
    try {
        const {email} = req.query as { email?: string };
        if (!email) return res.status(400).json({error: 'email is required'});
        const user = await initiateResetPassword(email);
        res.status(200).json({user});
    } catch (err: any) {
        console.error('initiate_reset_password error', err);
        res.status(400).json({error: err.message ?? 'Failed to initiate reset password'});
    }
});

// Optional: POST /reset_password
router.put('/users/:id/reset_password', async (req: Request, res: Response) => {
    try {
        const {id} = req.params as { id?: string };
        const {password, confirm_password, reset_token} = req.body as {
            password: string,
            confirm_password: string,
            reset_token: string
        };
        if (!id) return res.status(400).json({error: 'user id is required'});
        const user = await setNewPassword(id, {password, confirm_password, reset_token});
        res.status(200).json({user});
    } catch (err: any) {
        console.error('initiate_reset_password error', err);
        res.status(400).json({error: err.message ?? 'Failed to initiate reset password'});
    }
});

export default router;
