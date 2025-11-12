export type User = {
    id: string;          // Google sub or your own DB id
    email: string;
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
