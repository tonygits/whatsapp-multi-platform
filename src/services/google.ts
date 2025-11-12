import {OAuth2Client, TokenPayload} from 'google-auth-library';
import {User} from "../types/user";
import userService from "./userService"; // only if you need to call Google endpoints (not required in many cases)

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CALLBACK_URL = (process.env.BASE_URL || 'http://localhost:3000') + '/auth/google/callback';

const client = new OAuth2Client(CLIENT_ID);

// verify id token from client-side sign-in
export async function verifyIdTokenAndUpsertUser(idToken: string): Promise<User> {
    const ticket = await client.verifyIdToken({
        idToken,
        audience: CLIENT_ID
    });

    const payload = ticket.getPayload() as TokenPayload;
    if (!payload || !payload.sub) throw new Error('Invalid id token payload');

    //check if user exists
    const dbUser = await userService.getUserByEmail(payload.email as string);
    if (dbUser) {
        return dbUser;
    }

    const user: Partial<User> = {
        id: payload.sub,
        email: payload.email,
        firstName: payload.given_name ?? undefined,
        lastName: payload.family_name ?? undefined,
        name: payload.name ?? undefined,
        isVerified: true,
        picture: payload.picture ?? undefined,
        locale: payload.locale ?? undefined,
        provider: 'google'
    };

    return userService.registerNewUser(user);
}

// server-side exchange of auth code (optional)
export async function exchangeCodeAndProcess(code: string): Promise<{ user: User; tokens: any }> {
    if (!CLIENT_SECRET) throw new Error('CLIENT_SECRET required for code exchange');

    const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, CALLBACK_URL);
    const {tokens} = await oauth2Client.getToken(code);
    // tokens.id_token should be present
    const idToken = tokens.id_token;
    if (!idToken) throw new Error('No id_token returned from Google');

    const user = await verifyIdTokenAndUpsertUser(idToken);
    return {user, tokens};
}
