import 'dotenv/config';
import express, {Request, Response} from 'express';
import {exchangeCodeAndProcess, verifyIdTokenAndUpsertUser} from '../services/google';
import {signJwt} from '../utils/jwt';
import crypto from "crypto";
import {hashPassword, verifyPassword} from "../utils/password";
import {createNewSession, listSessionsForUser} from "../services/sessionService";
import {User} from "../types/user";
import {Session} from "../types/session";
import userService from "../services/userService";
import {sendToQueue} from "../rabbitmq/producer";

const router = express.Router();

type BodyPayload = {
    to?: string | string[];
    title?: string;
    body?: string;
    html?: string;
    // optional: from/cc/bcc/replyTo can be passed from svc if needed
};

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
router.post('/google/callback', async (req: Request, res: Response) => {
    try {
        const {code} = req.body as { code?: string };
        if (!code) return res.status(400).json({error: 'code is required'});
        const {user} = await exchangeCodeAndProcess(code);

        res = await getSession(req, res, user)
        res.status(200).json({user: user});
    } catch (err: any) {
        console.error('auth/google/callback error', err);
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
        const userInfo = await userService.loginUser(email);

        if (!userInfo?.passwordHash) res.status(400).json({message: "user password is not set. please reset password"});

        if (userInfo?.passwordHash) {
            console.log("verifying password")
            const isValidated = verifyPassword(password, userInfo?.passwordHash as string)
            if (!isValidated){
                throw new Error("invalid credentials")
            }
        }
        const {passwordHash: userPassword, ...userWithoutPassword} = userInfo
        if (userInfo.verificationInitialized) {
            res.status(200).json({user: userWithoutPassword});
            return
        }

        res = await getSession(req, res, userInfo)
        res.status(200).json({user: userWithoutPassword});
    } catch (err: any) {
        console.error('failed to login with error', err);
        res.status(400).json({error: err.message ?? 'Failed to failed to login'});
    }
});

// Optional: POST /register user
router.post('/register', async (req: Request, res: Response) => {
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

        const userId = crypto.randomUUID();
        const passwordHash = await hashPassword(password);

        const partial: Partial<User> = {
            id: userId,
            email: email,
            firstName: first_name ?? undefined,
            lastName: last_name ?? undefined,
            contactPhone: contact_phone ?? undefined,
            isVerified: false,
            name: name,
            passwordHash: passwordHash,
            provider: 'application'
        };

        //register user
        const user = await userService.registerNewUser(partial);
        res.status(201).json({user: user});
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
        const user = await userService.initiateResetPassword(email);
        res.status(200).json({user: user});
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
        const user = await userService.setNewPassword(id, {password, confirm_password, reset_token});
        res.status(200).json({user});
    } catch (err: any) {
        console.error('initiate_reset_password error', err);
        res.status(400).json({error: err.message ?? 'Failed to reset password'});
    }
});

async function getSession (req: Request, res: Response, user: User) {
    //check if there is active sessions
    let activeSession: Session | null = null;
    const sessions = await listSessionsForUser(user.id);
    const userAgent = req.headers["user-agent"];
    if (sessions.length>0){
        sessions.forEach((session) => {
            if (session.userAgent === userAgent){
                activeSession = session
            }
        });
    }

    // //create session
    if (!activeSession) {
        const sessionId = crypto.randomUUID();
        const ip = req.ip;
        activeSession = await createNewSession({
            id: sessionId,
            userId: user.id,
            userAgent: userAgent as string,
            ipAddress: ip as string
        })
    }

    const token = signJwt({sub: activeSession.id, name: user.name, admin: true, iss: user.id});
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('access_token', token);
    return res
}

router.post('/send-email', async (req: Request<{}, {}, BodyPayload>, res: Response) => {
    try {
        const { to, title, body, html } = req.body ?? {};

        // If you always send to a default recipient (e.g., notifications), set it via env
        const recipient = to || process.env.DEFAULT_EMAIL_TO;
        if (!recipient) {
            return res.status(400).json({ ok: false, error: '`to` is required (or set DEFAULT_EMAIL_TO env)' });
        }

        if (!title || (!body && !html)) {
            return res.status(400).json({ ok: false, error: 'Missing title or body/html' });
        }

        await sendToQueue({type: 'email', id: crypto.randomBytes(6).toString("hex"),
            payload: {from: process.env.SMTP_FROM_INFO, to: recipient, title, body, html}});

        return res.json({ ok: true });
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('send-email error', err);
        return res.status(500).json({ ok: false, error: err?.message ?? 'Failed to send' });
    }
});

// Optional: POST /verify email
router.put('/:id/verify_email', async (req: Request, res: Response) => {
    try {
        const {id} = req.params as { id: string };
        const {code} = req.query as { code: string };
        if (!id) return res.status(400).json({error: 'user id is required'});
        const user = await userService.verifyUserEmail(id, code);
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
