import { getAdminSettings, updateAdminSettings } from '@/lib/admin/settings';
import { logAdminAudit } from '@/lib/admin/telemetry';

export interface SafeRazorpayConfig {
  keyId: string | null;
  isConfigured: boolean;
  webhookConfigured: boolean;
  isEnabled: boolean;
  mode: 'test' | 'live';
}

/**
 * Returns safe Razorpay configuration for browser consumption.
 * STRICTLY NEVER EXPOSES secret keys or webhooks.
 */
export async function getSafeRazorpayConfig(): Promise<SafeRazorpayConfig> {
  const settings = await getAdminSettings();
  const envKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keyId = settings.razorpay_key_id || envKeyId || null;

  const hasSecret = Boolean(
    process.env.RAZORPAY_KEY_SECRET || settings.razorpay_secret_set
  );
  const hasWebhook = Boolean(
    process.env.RAZORPAY_WEBHOOK_SECRET || settings.razorpay_webhook_secret_set
  );

  const mode = keyId?.startsWith('rzp_live_') ? 'live' : 'test';

  return {
    keyId,
    isConfigured: Boolean(keyId && hasSecret),
    webhookConfigured: hasWebhook,
    isEnabled: Boolean(settings.razorpay_enabled),
    mode,
  };
}

/**
 * Allows administrators to configure Razorpay settings safely.
 * Secret keys are stored securely server-side or logged as configured flags.
 */
export async function updateRazorpayConfig(
  params: {
    keyId?: string;
    secret?: string;
    webhookSecret?: string;
    isEnabled?: boolean;
  },
  adminEmail: string,
  adminUserId?: string
): Promise<SafeRazorpayConfig> {
  const updates: Record<string, unknown> = {};

  if (params.keyId !== undefined) {
    updates.razorpay_key_id = params.keyId.trim() || null;
  }
  if (params.secret !== undefined && params.secret.trim()) {
    updates.razorpay_secret_set = true;
    // In production environment, secrets can be stored in secure secrets manager or DB vault
    process.env.RAZORPAY_KEY_SECRET = params.secret.trim();
  }
  if (params.webhookSecret !== undefined && params.webhookSecret.trim()) {
    updates.razorpay_webhook_secret_set = true;
    process.env.RAZORPAY_WEBHOOK_SECRET = params.webhookSecret.trim();
  }
  if (params.isEnabled !== undefined) {
    updates.razorpay_enabled = Boolean(params.isEnabled);
  }

  await updateAdminSettings(updates as any, adminEmail, adminUserId);

  await logAdminAudit({
    adminUserId,
    adminEmail,
    action: 'RAZORPAY_CONFIG_UPDATED',
    targetType: 'payment_gateway',
    targetId: 'razorpay',
    details: {
      keyIdUpdated: Boolean(params.keyId),
      secretConfigured: Boolean(params.secret),
      enabled: params.isEnabled,
    },
  });

  return getSafeRazorpayConfig();
}
