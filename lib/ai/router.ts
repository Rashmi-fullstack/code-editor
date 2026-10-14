import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptApiKey, maskApiKey } from './crypto';
import { GeminiProvider, HuggingFaceProvider, type AIProvider } from './provider';
import { recordTokenUsage, type AiOperation, type AiKeySource } from './usage';
import { DEVELOPER_IDE_CONFIG } from './developer-ide-config';

export interface ActiveAIConfig {
  provider: AIProvider;
  providerId: string;
  model: string;
  apiKey: string;
  keySource: AiKeySource;
  maskedKey?: string;
}

const geminiProvider = new GeminiProvider();
const huggingfaceProvider = new HuggingFaceProvider();

const PROVIDERS: Record<string, AIProvider> = {
  'google-gemini': geminiProvider,
  'huggingface': huggingfaceProvider,
};

/**
 * Resolves the effective AI configuration for a given user and workspace scope.
 * For 'developer' scope (Developer IDE), prioritizes Hugging Face Qwen3-Coder:
 * 1. User's personal BYOK key (if set for huggingface or default)
 * 2. Server platform HF_TOKEN (model: Qwen/Qwen3-Coder-480B-A35B-Instruct)
 *
 * For 'product' scope (Product Manager), strictly preserves Google Gemini.
 */
export async function resolveAIConfig(
  supabase?: SupabaseClient | null,
  userId?: string | null,
  preferredScope: 'developer' | 'product' = 'developer'
): Promise<ActiveAIConfig> {
  // Check for admin-configured platform key in user_ai_keys
  try {
    const { createPrivilegedClient } = await import('@/lib/server');
    const privileged = createPrivilegedClient();
    let keyRecord: { provider: string; model: string | null; encrypted_key: string; key_hint: string | null; user_id: string } | null = null;
    
    if (userId) {
      const { data } = await privileged
        .from('user_ai_keys')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
      keyRecord = data;
    }
    if (!keyRecord) {
      const { data } = await privileged
        .from('user_ai_keys')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      keyRecord = data;
    }

    if (keyRecord && keyRecord.encrypted_key) {
      try {
        const decryptedKey = decryptApiKey(keyRecord.encrypted_key);
        const providerId = keyRecord.provider || (preferredScope === 'developer' ? 'huggingface' : 'google-gemini');
        const provider = PROVIDERS[providerId] || (preferredScope === 'developer' ? huggingfaceProvider : geminiProvider);
        const defaultModel = providerId === 'huggingface' ? DEVELOPER_IDE_CONFIG.model : 'gemini-flash-latest';

        if (
          (preferredScope === 'product' && providerId === 'google-gemini') ||
          (preferredScope === 'developer' && providerId === 'huggingface')
        ) {
          return {
            provider,
            providerId,
            model: keyRecord.model || defaultModel,
            apiKey: decryptedKey,
            keySource: userId === keyRecord.user_id ? 'byok' : 'platform',
            maskedKey: keyRecord.key_hint || maskApiKey(decryptedKey),
          };
        }
      } catch (decryptErr) {
        console.warn('[AI Router] Failed to decrypt configured key, falling back to environment:', decryptErr);
      }
    }
  } catch (err) {
    // Non-blocking fallback to environment
  }


  // Developer IDE: Resolves primary provider based on Admin Settings configuration
  if (preferredScope === 'developer') {
    let primaryProvider = 'huggingface';
    try {
      const { getAdminSettings } = await import('@/lib/admin/settings');
      const settings = await getAdminSettings();
      if (settings.primary_provider) {
        primaryProvider = settings.primary_provider;
      }
    } catch {
      // Fallback to default
    }

    if (primaryProvider === 'google-gemini') {
      const platformGeminiKey = process.env.GEMINI_API_KEY?.trim();
      if (platformGeminiKey) {
        return {
          provider: geminiProvider,
          providerId: 'google-gemini',
          model: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
          apiKey: platformGeminiKey,
          keySource: 'platform',
        };
      }
    }

    const hfToken = process.env.HF_TOKEN?.trim();
    if (hfToken) {
      return {
        provider: huggingfaceProvider,
        providerId: DEVELOPER_IDE_CONFIG.provider,
        model: process.env.HF_MODEL?.trim() || DEVELOPER_IDE_CONFIG.model,
        apiKey: hfToken,
        keySource: 'platform',
      };
    }

    const platformGeminiKey = process.env.GEMINI_API_KEY?.trim();
    if (platformGeminiKey) {
      return {
        provider: geminiProvider,
        providerId: 'google-gemini',
        model: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
        apiKey: platformGeminiKey,
        keySource: 'platform',
      };
    }

    throw new Error(
      'Hugging Face API token is not configured. Please configure your Hugging Face API Token in Profile or set HF_TOKEN in the server environment.'
    );
  }

  // Product Manager: Uses Google Gemini (or platform fallback)
  const platformGeminiKey = process.env.GEMINI_API_KEY?.trim();
  if (platformGeminiKey) {
    const rawModel = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
    const cleanModel =
      !rawModel ||
      rawModel === 'gemini-1.5-flash' ||
      rawModel === 'gemini-1.5-pro' ||
      rawModel === 'gemini-2.5-flash' ||
      rawModel === 'gemini-2.5-flash-lite' ||
      rawModel === 'gemini-3.6-flash' ||
      rawModel.includes('Qwen') ||
      !rawModel.startsWith('gemini-')
        ? 'gemini-flash-latest'
        : rawModel;
    return {
      provider: geminiProvider,
      providerId: 'google-gemini',
      model: cleanModel,
      apiKey: platformGeminiKey,
      keySource: 'platform',
    };
  }

  const hfToken = process.env.HF_TOKEN?.trim();
  if (hfToken) {
    return {
      provider: huggingfaceProvider,
      providerId: DEVELOPER_IDE_CONFIG.provider,
      model: process.env.HF_MODEL?.trim() || DEVELOPER_IDE_CONFIG.model,
      apiKey: hfToken,
      keySource: 'platform',
    };
  }

  throw new Error(
    'No AI provider API key is configured. Please configure your API Key in Profile or set GEMINI_API_KEY in the server environment.'
  );
}

/**
 * Log token usage for an executed AI operation.
 */
export async function trackAiUsage(
  supabase: SupabaseClient | null,
  params: {
    userId?: string | null;
    projectId?: string | null;
    config: ActiveAIConfig;
    operation: AiOperation;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    success: boolean;
    creditUsed?: number;
    latencyMs?: number;
  }
) {
  if (!supabase || !params.userId) return;

  await recordTokenUsage(supabase, {
    userId: params.userId,
    projectId: params.projectId || undefined,
    provider: params.config.providerId,
    model: params.config.model,
    operation: params.operation,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    totalTokens: params.totalTokens,
    keySource: params.config.keySource,
    success: params.success,
    creditUsed: params.creditUsed,
    latencyMs: params.latencyMs,
  });
}
