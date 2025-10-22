import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';
const JWT_EXPIRES_IN = 365 * 24 * 60 * 60;

export interface TokenPayload extends JwtPayload {
    sub: string; // subject (session ID)
    iss?: string; // user (email)
    [key: string]: any;
}

export function signJwt(payload: TokenPayload): string {
    const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
    return jwt.sign(payload, JWT_SECRET as jwt.Secret, options);
}

export function verifyJwt(token: string): TokenPayload {
    return jwt.verify(token, JWT_SECRET as jwt.Secret) as TokenPayload;
}
