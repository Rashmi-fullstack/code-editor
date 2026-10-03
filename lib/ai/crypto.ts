import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret =
    process.env.ENCRYPTION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'codatron-ai-studio-secure-encryption-key-fallback';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a user API key using AES-256-GCM.
 * Output format: iv:authTag:encryptedData (hex encoded)
 */
export function encryptApiKey(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Invalid key provided for encryption');
  }
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext.trim(), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted user API key.
 */
export function decryptApiKey(payload: string): string {
  if (!payload || typeof payload !== 'string' || !payload.includes(':')) {
    throw new Error('Invalid encrypted payload');
  }

  const [ivHex, authTagHex, encryptedData] = payload.split(':');
  if (!ivHex || !authTagHex || !encryptedData) {
    throw new Error('Malformed encrypted payload');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Create a safe masked display of an API key (e.g. ••••••••••••••••1234).
 * Never exposes more than the last 4 characters.
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 4) {
    return '••••••••••••';
  }
  const suffix = trimmed.slice(-4);
  return `••••••••••••••••${suffix}`;
}
