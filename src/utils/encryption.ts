// aesApiKey.ts
import crypto from "crypto";
import deviceKeyRepository from "../repositories/DeviceKeyRepository";

// --- Config ---
// Provide a 32-byte master key in env as hex (recommended in production):
//   export MASTER_KEY_HEX="..." (64 hex chars)
const MASTER_KEY_HEX = process.env.MASTER_KEY_HEX;
if (!MASTER_KEY_HEX) {
    console.warn("No MASTER_KEY_HEX provided. Using ephemeral key (not for production).");
}
const MASTER_KEY = MASTER_KEY_HEX
    ? Buffer.from(MASTER_KEY_HEX, "hex")
    : crypto.randomBytes(32); // 32 bytes -> AES-256

if (MASTER_KEY.length !== 32) throw new Error("MASTER_KEY must be 32 bytes");

// helper: AEAD encrypt (AES-256-GCM)
// returns base64(iv + authTag + ciphertext)
function encryptPayload(payload: string) {
    const iv = crypto.randomBytes(12); // 12 bytes recommended for GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", MASTER_KEY, iv);
    const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // concat: iv | authTag | ciphertext
    return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

// helper: decrypt
function decryptPayload(tokenB64: string) {
    const buf = Buffer.from(tokenB64, "base64");
    if (buf.length < 12 + 16) throw new Error("token too short");
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 12 + 16);
    const ciphertext = buf.subarray(12 + 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", MASTER_KEY, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString("utf8");
}

// create API token (returns keyId and encrypted token)
// NOTE: token is ciphertext (client never sees raw secret)
export async function createApiToken(userId: string, deviceHash: string) {
    // payload can include random nonce, userId and creation timestamp
    const nonce = crypto.randomBytes(16).toString("hex");
    const createdAt = Date.now();
    const payload = JSON.stringify({userId, deviceHash, nonce, createdAt});
    const token = encryptPayload(payload);
    const keyId: string = crypto.randomUUID();

    const deviceKey = await deviceKeyRepository.findByUserIdAndDeviceId(userId, deviceHash);
    if (deviceKey) {
        throw new Error('You already have a key. Please delete the current active key and then create a new one');
    }

    // store token server-side for revocation / lookup (optional)
    const newKey = {
        deviceKeyId: crypto.randomUUID(),
        deviceHash: deviceHash,
        userId: userId,
        apiKeyId: keyId,
        encryptedToken: nonce,
    };
    await deviceKeyRepository.create(newKey);

    // RETURN only keyId and token (token is encrypted ciphertext, not raw secret)
    // Client will present "ApiKey <keyId>:<token>"
    return `${keyId}:${token}`;
}

// verifyApiToken: accepts "keyId:token" or "token" (but recommended keyId:token)
export async function verifyApiToken(raw: string) {
    // allow "keyId:token" format
    const [maybeKeyId, maybeToken] = raw.includes(":") ? raw.split(":") : [null, raw];
    const keyId = maybeKeyId;
    const token = maybeToken;
    let record = await deviceKeyRepository.findByApiKey(keyId as string);
    if (!record) return null; // unknown or revoked
    // if keyId provided, quick lookup (and optional revocation check)
    if (keyId) {
        // decrypt to validate payload more strongly
        try {
            const plain = decryptPayload(token);
            const obj = JSON.parse(plain);
            if (obj.nonce !== record.encryptedToken) return null;
            if (obj.userId !== record.userId) return null;
            if (obj.deviceHash !== record.deviceHash) return null;
            // optional: check expiry or createdAt if you want short-lived tokens
            return {
                userId: record.userId,
                deviceHash: record.deviceHash,
            };
        } catch (e) {
            return null;
        }
    }
    return null;
}

// revoke token (server-side)
export async function revokeKey(deviceKeyId: string) {
    return await deviceKeyRepository.deactivateKey(deviceKeyId);
}
