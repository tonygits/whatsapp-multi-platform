import bcrypt from 'bcrypt';

export async function hashPassword(password: string): Promise<string> {
    const saltRounds = 10; // Adjust for security/performance balance
    return await bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
    return await bcrypt.compare(password, hashed);
}
