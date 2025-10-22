import userRepository from "../repositories/UserRepository";
import logger from "../utils/logger";
import {hashPassword, verifyPassword} from '../utils/password';
import deviceRepository from "../repositories/DeviceRepository";
import {signJwt} from "../utils/jwt";

export type User = {
    id: string;          // Google sub or your own DB id
    email?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    contactPhone?: string;
    picture?: string;
    locale?: string;
    isVerified: boolean;
    verificationCode?: string;
    verificationCodeExpires?: string;
    resetToken?: string;
    resetTokenExpires?: string;
    passwordHash?: string;
    provider?: string;   // 'google'
    createdAt: string;
    updatedAt: string;
};

export type SetUserPasswordForm = {
    reset_token: string;
    password: string;
    confirm_password: string;
}

export async function registerNewUser(partial: Partial<User>): Promise<User> {
    try {
        logger.info(`Registering user: ${partial.email as string}`);

        if (!partial.id) throw new Error('missing id');
        const now = new Date().toISOString();

        // Check if user already exists
        const existingUser = await userRepository.findByEmail(partial.email as string);
        if (existingUser) {
            throw new Error(`User ${partial.email as string} already registered`);
        }

        // Create user record
        const user = await userRepository.create({
            id: partial.id,
            email: partial.email,
            name: partial.name,
            picture: partial.picture,
            isVerified: true,
            provider: partial.provider ?? 'google',
            createdAt: now,
            updatedAt: now
        });

        logger.info(`User registered successfully: ${user.email}`, {userId: user.id});

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

export async function getUserById(id: string): Promise<User | null> {
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

export async function listUsers():Promise<User[]> {
    try {
        const users = await deviceRepository.findAll();
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

export async function getUserByEmail(email: string): Promise<User | null> {
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

export async function loginUser(email: string, password: string): Promise<{token: string, user: User}> {
    try {
        const user = await userRepository.findByEmail(email);
        if (!user) {
            throw new Error("user does not exist");
        }

        const isValidated = verifyPassword(password, user.passwordHash)
        if (!isValidated){
            throw new Error("invalid credentials")
        }

        const token = signJwt({sub: user.id, name: user.name, admin: true, iss: user.email});
        return {token, user}
    } catch (error) {
        logger.error(`Error logging in user ${email}:`, error);
        throw error;
    }
}

export async function initiateEmailVerification(email: string): Promise<User | null> {
    try {
        const user = await userRepository.findByEmail(email);

        if (!user) {
            return null;
        }

        const code = generateRandomString(6)
        const now = new Date().toISOString();
        const updatedUser: User = await userRepository.update(user.id, { verificationCode: code, verificationCodeExpires: now });

        return {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            contactPhone: updatedUser.contactPhone,
            picture: updatedUser.picture,
            locale: updatedUser.locale,
            isVerified: updatedUser.isVerified,
            verificationCode: updatedUser.verificationCode,
            verificationCodeExpires: updatedUser.verificationCodeExpires,
            resetToken: updatedUser.resetToken,
            resetTokenExpires: updatedUser.resetTokenExpires,
            provider: updatedUser.provider,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt
        }
    } catch (error) {
        logger.error(`Error searching for user ${email}:`, error);
        throw error;
    }
}

export async function verifyUserEmail(id: string, code: string): Promise<User | null> {
    try {
        const user = await userRepository.findById(id);

        if (!user) {
            return null;
        }

        if (user.verification_code !== code) {
            throw new Error('Invalid verification code');
        }

       const updatedUser: User = await userRepository.update(user.id, { isVerified: true });

        return {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            contactPhone: updatedUser.contactPhone,
            picture: updatedUser.picture,
            locale: updatedUser.locale,
            isVerified: updatedUser.isVerified,
            verificationCode: updatedUser.verificationCode,
            verificationCodeExpires: updatedUser.verificationCodeExpires,
            resetToken: updatedUser.resetToken,
            resetTokenExpires: updatedUser.resetTokenExpires,
            provider: updatedUser.provider,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt
        }
    } catch (error) {
        logger.error(`Error searching for user ${id}:`, error);
        throw error;
    }
}

export async function initiateResetPassword(email: string): Promise<User | null> {
    try {
        const user = await userRepository.findByEmail(email);

        if (!user) {
            return null;
        }

        const code = generateRandomString(6)
        const now = new Date().toISOString();
        const updatedUser: User = await userRepository.update(user.id, { verificationCode: code, verificationCodeExpires: now });

        return {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            contactPhone: updatedUser.contactPhone,
            picture: updatedUser.picture,
            locale: updatedUser.locale,
            isVerified: updatedUser.isVerified,
            verificationCode: updatedUser.verificationCode,
            verificationCodeExpires: updatedUser.verificationCodeExpires,
            resetToken: updatedUser.resetToken,
            resetTokenExpires: updatedUser.resetTokenExpires,
            provider: updatedUser.provider,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt
        }
    } catch (error) {
        logger.error(`Error searching for user ${email}:`, error);
        throw error;
    }
}

export async function setNewPassword(id: string, resetPassword: SetUserPasswordForm): Promise<User | null> {
    try {
        const user: User = await userRepository.findById(id);

        if (!user) {
            return null;
        }

        if (resetPassword.password !== resetPassword.confirm_password) {
            throw new Error('Passwords do not match');
        }

        if (user.resetToken !== resetPassword.reset_token) {
            throw new Error('Invalid reset token');
        }

        //hash password
        const passwordHash = await hashPassword(resetPassword.password);
        const updatedUser: User = await userRepository.update(user.id, { passwordHash: passwordHash });

        return {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            contactPhone: updatedUser.contactPhone,
            picture: updatedUser.picture,
            locale: updatedUser.locale,
            isVerified: updatedUser.isVerified,
            verificationCode: updatedUser.verificationCode,
            verificationCodeExpires: updatedUser.verificationCodeExpires,
            resetToken: updatedUser.resetToken,
            resetTokenExpires: updatedUser.resetTokenExpires,
            provider: updatedUser.provider,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt
        }
    } catch (error) {
        logger.error(`Error searching for user ${id}:`, error);
        throw error;
    }
}
