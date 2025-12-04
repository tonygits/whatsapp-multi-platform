import userRepository from "../repositories/UserRepository";
import logger from "../utils/logger";
import {hashPassword} from '../utils/password';
import {SetUserPasswordForm, User} from "../types/user";
import {generateRandomString} from "../utils/random"
import {escapeHtml} from "../utils/paths";
import crypto from "crypto";
import {publishToQueue} from "../rabbitmq/producer";

class UserService {

     clientUrl: string;

    constructor() {
        this.clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    }

    async registerNewUser(partial: Partial<User>): Promise<User> {
        try {
            logger.info(`Registering user: ${partial.email as string}`);

            if (!partial) throw new Error('no user data');
            if (!partial.id) throw new Error('missing id');

            // Check if user already exists
            const existingUser = await userRepository.findByEmail(partial.email as string);
            if (existingUser) {
                throw new Error(`User ${partial.email as string} already registered`);
            }

            const code = generateRandomString(6);
            const now = new Date();
            now.setMinutes(now.getMinutes() + 10);

            // Create user record
            const user = await userRepository.create({
                id: partial.id,
                email: partial.email,
                firstName: partial.firstName,
                lastName: partial.lastName,
                name: partial.name,
                picture: partial.picture,
                isVerified: partial.isVerified,
                passwordHash: partial.passwordHash ?? null,
                provider: partial.provider ?? 'google',
                verificationCode: code,
                verificationCodeExpires: now.toISOString(),
                createdAt: now.toISOString(),
                updatedAt: now.toISOString()
            });

            logger.info(`User registered successfully: ${user.email}`, {userId: user.id});

            const title = 'Verify your Wapflow email';
            const verifyEmailUrl = `${this.clientUrl}/verify-email?code=${code}&userId=${user.id}`
            const html = `
            <p>Hi ${escapeHtml(user.first_name)},</p>
              <p>
                Welcome to <strong>Wapflow</strong>! To finish setting up your account, please verify your email address.
              </p>
              ${
                code ? `
                  <div style="text-align:center;margin:28px 0;">
                    <div style="
                      display:inline-block;
                      font-family:monospace;
                      font-size:20px;
                      letter-spacing:3px;
                      background:#f3f4f6;
                      color:#111;
                      padding:12px 18px;
                      border-radius:8px;
                    ">
                      ${escapeHtml(code)}
                    </div>
                  </div>
                  `
                    : ''
            }
              ${verifyEmailUrl ? `
                  <p style="text-align:center;margin-bottom:24px;">
                    <a href="${escapeHtml(verifyEmailUrl)}"
                      style="
                        display:inline-block;
                        background:#2563eb;
                        color:#fff;
                        padding:12px 20px;
                        border-radius:8px;
                        text-decoration:none;
                        font-weight:600;
                      "
                    >
                      Verify My Email
                    </a>
                  </p>
                  `
                : ''
            }
              <p>
                ${verifyEmailUrl
                ? `If the button above doesn’t work, you can also copy and paste this link into your browser:<br/>
                    <a href="${escapeHtml(verifyEmailUrl)}" style="color:#2563eb;">${escapeHtml(verifyEmailUrl)}</a>`
                : ''
            }
              </p>
              <p>
                If you didn’t create an account on Wapflow, please ignore this message — no action is needed.
              </p>
            
              <p style="font-size:13px;color:#666;margin-top:24px;">
                Need help? Visit our
                <a href="https://wapflow.app/help" style="color:#2563eb;text-decoration:none;">Help Center</a>.
              </p>
            `;
            await publishToQueue({type: 'email', id: crypto.randomBytes(6).toString("hex"),
                payload: {from: process.env.SMTP_FROM_INFO, to: user.email, title, html}});

            return {
                id: user.id,
                email: user.email,
                name: user.name,
                firstName: user.first_name,
                lastName: user.last_name,
                contactPhone: user.contact_phone,
                picture: user.picture,
                locale: user.locale,
                isVerified: user.is_verified,
                verificationCode: user.verification_code,
                verificationCodeExpires: user.verification_code_expires,
                resetToken: user.reset_token,
                resetTokenExpires: user.reset_token_expires,
                provider: user.provider,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            }
        } catch (error) {
            logger.error(`Error registering user ${partial.email as string}:`, error);
            throw error;
        }
    }

    async getUserById(id: string): Promise<User | null> {
        try {
            const user = await userRepository.findById(id);

            if (!user) {
                return null;
            }

            return {
                id: user.id,
                email: user.email,
                name: user.name,
                firstName: user.first_name,
                lastName: user.last_name,
                contactPhone: user.contact_phone,
                picture: user.picture,
                locale: user.locale,
                isVerified: user.is_verified,
                verificationCode: user.verification_code,
                verificationCodeExpires: user.verification_code_expires,
                resetToken: user.reset_token,
                resetTokenExpires: user.reset_token_expires,
                provider: user.provider,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            }
        } catch (error) {
            logger.error(`Error searching for user ${id}:`, error);
            throw error;
        }
    }

    async listUsers(): Promise<User[]> {
        try {
            const users = await userRepository.findAll();
            if (Array.isArray(users)) {
                return users.map((user: any) => ({
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    contactPhone: user.contact_phone,
                    picture: user.picture,
                    locale: user.locale,
                    isVerified: user.is_verified,
                    verificationCode: user.verification_code,
                    verificationCodeExpires: user.verification_code_expires,
                    resetToken: user.reset_token,
                    resetTokenExpires: user.reset_token_expires,
                    provider: user.provider,
                    createdAt: user.created_at,
                    updatedAt: user.updated_at
                }));
            } else {
                logger.warn('findAll() did not return an array of users');
                return [];
            }
        } catch (error) {
            logger.error('Error listing users:', error);
            throw error;
        }
    }

    async getUserByEmail(email: string): Promise<User | null> {
        try {
            const user = await userRepository.findByEmail(email);

            if (!user) {
                return null;
            }

            return {
                id: user.id,
                email: user.email,
                name: user.name,
                firstName: user.first_name,
                lastName: user.last_name,
                contactPhone: user.contact_phone,
                picture: user.picture,
                locale: user.locale,
                isVerified: user.is_verified,
                verificationCode: user.verification_code,
                verificationCodeExpires: user.verification_code_expires,
                resetToken: user.reset_token,
                resetTokenExpires: user.reset_token_expires,
                provider: user.provider,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            }
        } catch (error) {
            logger.error(`Error searching for user ${email}:`, error);
            throw error;
        }
    }


     async loginUser(email: string): Promise<any> {
        try {
            let user = await userRepository.findByEmail(email);
            if (!user) {
                throw new Error("user does not exist");
            }

            let verifyUser: boolean = false;
            if (!user.is_verified){
                const code = generateRandomString(6);
                const now = new Date();
                now.setMinutes(now.getMinutes() + 10);
                user = await userRepository.update(user.id, {
                    verificationCode: code,
                    verificationCodeExpires: now.toISOString(),
                });

                const title = 'Verify your Wapflow email';
                const verifyEmailUrl = `${this.clientUrl}/verify-email?code=${code}&userId=${user.id}`
                const html = `
            <p>Hi ${escapeHtml(user.first_name)},</p>
              <p>
                Welcome to <strong>Wapflow</strong>! To finish setting up your account, please verify your email address.
              </p>
              ${
                    code ? `
                  <div style="text-align:center;margin:28px 0;">
                    <div style="
                      display:inline-block;
                      font-family:monospace;
                      font-size:20px;
                      letter-spacing:3px;
                      background:#f3f4f6;
                      color:#111;
                      padding:12px 18px;
                      border-radius:8px;
                    ">
                      ${escapeHtml(code)}
                    </div>
                  </div>
                  `
                        : ''
                }
              ${verifyEmailUrl ? `
                  <p style="text-align:center;margin-bottom:24px;">
                    <a href="${escapeHtml(verifyEmailUrl)}"
                      style="
                        display:inline-block;
                        background:#2563eb;
                        color:#fff;
                        padding:12px 20px;
                        border-radius:8px;
                        text-decoration:none;
                        font-weight:600;
                      "
                    >
                      Verify My Email
                    </a>
                  </p>
                  `
                    : ''
                }
              <p>
                ${verifyEmailUrl
                    ? `If the button above doesn’t work, you can also copy and paste this link into your browser:<br/>
                    <a href="${escapeHtml(verifyEmailUrl)}" style="color:#2563eb;">${escapeHtml(verifyEmailUrl)}</a>`
                    : ''
                }
              </p>
              <p>
                If you didn’t create an account on Wapflow, please ignore this message — no action is needed.
              </p>
            
              <p style="font-size:13px;color:#666;margin-top:24px;">
                Need help? Visit our
                <a href="https://wapflow.app/help" style="color:#2563eb;text-decoration:none;">Help Center</a>.
              </p>
            `;
                await publishToQueue({type: 'email', id: crypto.randomBytes(6).toString("hex"),
                    payload: {from: process.env.SMTP_FROM_INFO, to: user.email, title, html}});
                verifyUser = true
            }

            return {
                id: user.id,
                email: user.email,
                name: user.name,
                firstName: user.first_name,
                lastName: user.last_name,
                contactPhone: user.contact_phone,
                picture: user.picture,
                locale: user.locale,
                isVerified: user.is_verified,
                verificationCode: user.verification_code,
                verificationCodeExpires: user.verification_code_expires,
                resetToken: user.reset_token,
                passwordHash: user.password_hash,
                resetTokenExpires: user.reset_token_expires,
                provider: user.provider,
                createdAt: user.created_at,
                updatedAt: user.updated_at,
                verificationInitialized: verifyUser
            }
        } catch (error) {
            logger.error(`Error logging in user ${email}:`, error);
            throw error;
        }
    }

     async initiateEmailVerification(email: string): Promise<User | null> {
        try {
            const user = await userRepository.findByEmail(email);

            if (!user) {
                return null;
            }

            const code = generateRandomString(6)
            const now = new Date();
            now.setMinutes(now.getMinutes() + 10);
            const updatedUser = await userRepository.update(user.id, {
                verificationCode: code,
                verificationCodeExpires: now.toISOString(),
            });

            const title = 'Verify your Wapflow email';
            const verifyEmailUrl = `${this.clientUrl}/verify-email?code=${code}&userId=${user.id}`
            const html = `
            <p>Hi ${escapeHtml(user.first_name)},</p>
              <p>
                Welcome to <strong>Wapflow</strong>! To finish setting up your account, please verify your email address.
              </p>
              ${
                code ? `
                  <div style="text-align:center;margin:28px 0;">
                    <div style="
                      display:inline-block;
                      font-family:monospace;
                      font-size:20px;
                      letter-spacing:3px;
                      background:#f3f4f6;
                      color:#111;
                      padding:12px 18px;
                      border-radius:8px;
                    ">
                      ${escapeHtml(code)}
                    </div>
                  </div>
                  `
                    : ''
            }
              ${verifyEmailUrl ? `
                  <p style="text-align:center;margin-bottom:24px;">
                    <a href="${escapeHtml(verifyEmailUrl)}"
                      style="
                        display:inline-block;
                        background:#2563eb;
                        color:#fff;
                        padding:12px 20px;
                        border-radius:8px;
                        text-decoration:none;
                        font-weight:600;
                      "
                    >
                      Verify My Email
                    </a>
                  </p>
                  `
                : ''
            }
              <p>
                ${verifyEmailUrl
                ? `If the button above doesn’t work, you can also copy and paste this link into your browser:<br/>
                    <a href="${escapeHtml(verifyEmailUrl)}" style="color:#2563eb;">${escapeHtml(verifyEmailUrl)}</a>`
                : ''
            }
              </p>
              <p>
                If you didn’t create an account on Wapflow, please ignore this message — no action is needed.
              </p>
            
              <p style="font-size:13px;color:#666;margin-top:24px;">
                Need help? Visit our
                <a href="https://wapflow.app/help" style="color:#2563eb;text-decoration:none;">Help Center</a>.
              </p>
            `;
            await publishToQueue({type: 'email', id: crypto.randomBytes(6).toString("hex"),
                payload: {from: process.env.SMTP_FROM_INFO, to: user.email, title, html}});

            return {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                firstName: updatedUser.first_name,
                lastName: updatedUser.last_name,
                contactPhone: updatedUser.contact_phone,
                picture: updatedUser.picture,
                locale: updatedUser.locale,
                isVerified: updatedUser.is_verified,
                verificationCode: updatedUser.verification_code,
                verificationCodeExpires: updatedUser.verification_code_expires,
                resetToken: updatedUser.reset_token,
                resetTokenExpires: updatedUser.reset_token_expires,
                provider: updatedUser.provider,
                createdAt: updatedUser.created_at,
                updatedAt: updatedUser.updated_at
            }
        } catch (error) {
            logger.error(`Error searching for user ${email}:`, error);
            throw error;
        }
    }

     async verifyUserEmail(id: string, code: string): Promise<User | null> {
        try {
            const user = await userRepository.findById(id);

            if (!user) {
                return null;
            }

            const expiry = new Date(user.verification_code_expires);
            const now = new Date();
            if (now.getTime() > expiry.getTime()) {
                throw new Error('Verification code has expired. Please generate a new verification code');
            }

            if (user.verification_code !== code) {
                throw new Error('Invalid verification code');
            }

            const updatedUser = await userRepository.update(user.id, {isVerified: true, verificationCode: null, verificationCodeExpires: null});

            return {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                firstName: updatedUser.first_name,
                lastName: updatedUser.last_name,
                contactPhone: updatedUser.contact_phone,
                picture: updatedUser.picture,
                locale: updatedUser.locale,
                isVerified: updatedUser.is_verified,
                verificationCode: updatedUser.verification_code,
                verificationCodeExpires: updatedUser.verification_code_expires,
                resetToken: updatedUser.reset_token,
                resetTokenExpires: updatedUser.reset_token_expires,
                provider: updatedUser.provider,
                createdAt: updatedUser.created_at,
                updatedAt: updatedUser.updated_at
            }
        } catch (error) {
            logger.error(`Error searching for user ${id}:`, error);
            throw error;
        }
    }

     async initiateResetPassword(email: string): Promise<User | null> {
        try {
            const user = await userRepository.findByEmail(email);

            if (!user) {
                return null;
            }

            const code = generateRandomString(6)
            const now = new Date();
            now.setMinutes(now.getMinutes() + 10);
            const updatedUser = await userRepository.update(user.id, {resetToken: code, resetTokenExpires: now.toISOString()});

            const title = 'Reset your Wapflow password';
            const resetPasswordUrl = `${this.clientUrl}/forgot-password?resetCode=${code}&userId=${user.id}`
            const html = `<p>Hi ${escapeHtml(user.first_name)},</p>
              <p>
                We received a request to reset your password for your Wapflow account.
                Use the code below to reset it — this code will expire in 30 minutes.
              </p>
            
              <div style="text-align:center;margin:28px 0;">
                <div style="
                  display:inline-block;
                  font-family:monospace;
                  font-size:20px;
                  letter-spacing:3px;
                  background:#f3f4f6;
                  color:#111;
                  padding:12px 18px;
                  border-radius:8px;
                ">
                  ${escapeHtml(code)}
                </div>
              </div>
            
              <p style="text-align:center;margin-bottom:24px;">
                <a href="${escapeHtml(resetPasswordUrl)}"
                  style="
                    display:inline-block;
                    background:#2563eb;
                    color:#fff;
                    padding:12px 20px;
                    border-radius:8px;
                    text-decoration:none;
                    font-weight:600;
                  "
                >
                  Reset Password
                </a>
              </p>
            
              <p>If you didn’t request this password reset, please ignore this email — your password will remain unchanged.</p>
            
              <p style="font-size:13px;color:#666;margin-top:24px;">
                Need help? Visit our
                <a href="https://wapflow.app/help" style="color:#2563eb;text-decoration:none;">Help Center</a>.
              </p>
            `;
            await publishToQueue({type: 'email', id: crypto.randomBytes(6).toString("hex"),
                payload: {from: process.env.SMTP_FROM_INFO, to: user.email, title, html}});
            return {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                firstName: updatedUser.first_name,
                lastName: updatedUser.last_name,
                contactPhone: updatedUser.contact_phone,
                picture: updatedUser.picture,
                locale: updatedUser.locale,
                isVerified: updatedUser.is_verified,
                verificationCode: updatedUser.verification_code,
                verificationCodeExpires: updatedUser.verification_code_expires,
                resetToken: updatedUser.reset_token,
                resetTokenExpires: updatedUser.reset_token_expires,
                provider: updatedUser.provider,
                createdAt: updatedUser.created_at,
                updatedAt: updatedUser.updated_at
            }
        } catch (error) {
            logger.error(`Error searching for user ${email}:`, error);
            throw error;
        }
    }

     async setNewPassword(id: string, resetPassword: SetUserPasswordForm): Promise<User | null> {
        try {
            const user = await userRepository.findById(id);

            if (!user) {
                return null;
            }

            if (resetPassword.password !== resetPassword.confirm_password) {
                throw new Error('Passwords do not match');
            }

            const expiry = new Date(user.reset_token_expires);
            const now = new Date();
            if (now.getTime() > expiry.getTime()) {
                throw new Error('Reset code has expired. Please generate a new reset code');
            }

            if (user.reset_token !== resetPassword.reset_token) {
                throw new Error('Invalid reset token');
            }

            //hash password
            const passwordHash = await hashPassword(resetPassword.password);
            const updatedUser = await userRepository.update(user.id, {passwordHash: passwordHash, resetToken: null, resetTokenExpires: null});

            return {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                firstName: updatedUser.first_name,
                lastName: updatedUser.last_name,
                contactPhone: updatedUser.contact_phone,
                picture: updatedUser.picture,
                locale: updatedUser.locale,
                isVerified: updatedUser.is_verified,
                verificationCode: updatedUser.verification_code,
                verificationCodeExpires: updatedUser.verification_code_expires,
                resetToken: updatedUser.reset_token,
                resetTokenExpires: updatedUser.reset_token_expires,
                provider: updatedUser.provider,
                createdAt: updatedUser.created_at,
                updatedAt: updatedUser.updated_at
            }
        } catch (error) {
            logger.error(`Error searching for user ${id}:`, error);
            throw error;
        }
    }
}

export default new UserService();
