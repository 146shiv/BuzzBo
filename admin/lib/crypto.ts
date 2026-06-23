import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PREFIX = 'enc:v1:';

function getKey(): Buffer {
    const secret = process.env.ENCRYPTION_KEY || 'dev-encryption-key-change-in-production';
    return scryptSync(secret, 'buzzbo-salt', 32);
}

export function encryptSecret(plaintext: string): string {
    if (!plaintext || plaintext.startsWith(PREFIX)) return plaintext;
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(ciphertext: string): string {
    if (!ciphertext || !ciphertext.startsWith(PREFIX)) return ciphertext;
    const key = getKey();
    const payload = ciphertext.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = payload.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

const SECRET_KEYS = ['password', 'instagramApiAccessToken', 'groqApiKey', 'googleAiApiKey'] as const;

export function encryptConfigSecrets<T extends Record<string, unknown>>(config: T): T {
    const result = { ...config };
    for (const key of SECRET_KEYS) {
        const val = result[key];
        if (typeof val === 'string' && val && !val.startsWith(PREFIX)) {
            (result as Record<string, unknown>)[key] = encryptSecret(val);
        }
    }
    return result;
}

export function decryptConfigSecrets<T extends Record<string, unknown>>(config: T): T {
    const result = { ...config };
    for (const key of SECRET_KEYS) {
        const val = result[key];
        if (typeof val === 'string' && val.startsWith(PREFIX)) {
            (result as Record<string, unknown>)[key] = decryptSecret(val);
        }
    }
    return result;
}

export function maskSecret(value: string | undefined, visible = 4): string {
    if (!value) return '';
    if (value.length <= visible * 2) return '••••••••';
    return `${value.slice(0, visible)}${'•'.repeat(8)}${value.slice(-visible)}`;
}
