import { createPrivilegedClient } from '@/lib/server';
import type { AdminSettings } from '@/lib/types/database';
import { logAdminAudit } from './telemetry';

const DEFAULT_SETTINGS: AdminSettings = {
  id: 'global',
  primary_provider: 'huggingface',
  fallback_provider: 'google-gemini',
  auto_fallback_enabled: true,
  maintenance_mode: false,
  new_registrations_enabled: true,
  default_credit_limit: 4,
  system_announcement: null,
  razorpay_key_id: null,
  razorpay_secret_set: false,
  razorpay_webhook_secret_set: false,
  razorpay_enabled: false,
  updated_at: new Date().toISOString(),
  updated_by: 'system',
};

let cachedSettings: AdminSettings = { ...DEFAULT_SETTINGS };

/**
 * Authoritative retrieval of Admin Settings.
 */
export async function getAdminSettings(): Promise<AdminSettings> {
  try {
    const privileged = createPrivilegedClient();
    const { data, error } = await privileged
      .from('admin_settings')
      .select('*')
      .eq('id', 'global')
      .maybeSingle();

    if (!error && data) {
      cachedSettings = data;
      return data;
    }
  } catch (err) {
    console.warn('[Admin Settings] Falling back to memory settings cache:', err);
  }

  return cachedSettings;
}

/**
 * Updates application settings and records an audit log entry.
 */
export async function updateAdminSettings(
  updates: Partial<Omit<AdminSettings, 'id' | 'updated_at'>>,
  adminEmail: string,
  adminUserId?: string
): Promise<AdminSettings> {
  const updatedRecord: AdminSettings = {
    ...cachedSettings,
    ...updates,
    updated_at: new Date().toISOString(),
    updated_by: adminEmail,
  };

  try {
    const privileged = createPrivilegedClient();
    const { data, error } = await privileged
      .from('admin_settings')
      .upsert(updatedRecord)
      .select('*')
      .single();

    if (!error && data) {
      cachedSettings = data;
    } else {
      cachedSettings = updatedRecord;
    }
  } catch (err) {
    console.warn('[Admin Settings] Could not upsert to DB, updated in-memory cache:', err);
    cachedSettings = updatedRecord;
  }

  // Record administrative action in audit log
  await logAdminAudit({
    adminUserId,
    adminEmail,
    action: 'SETTINGS_UPDATED',
    targetType: 'settings',
    targetId: 'global',
    details: updates as Record<string, unknown>,
  });

  return cachedSettings;
}
