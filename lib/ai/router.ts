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
  // Check for User BYOK configuration in Supabase
  if (supabase && userId) {
    try {
      const { data, error } = await supabase
        .from('user_ai_keys')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (!error && data && data.encrypted_key) {
        try {
          const decryptedKey = decryptApiKey(data.encrypted_key);
          const provider = PROVIDERS[data.provider] || (preferredScope === 'developer' ? huggingfaceProvider : geminiProvider);
          const defaultModel = data.provider === 'huggingface' ? DEVELOPER_IDE_CONFIG.model : 'gemini-2.5-flash';
          return {
            provider,
            providerId: data.provider || (preferredScope === 'developer' ? 'huggingface' : 'google-gemini'),
            model: data.model || defaultModel,
            apiKey: decryptedKey,
            keySource: 'byok',
            maskedKey: data.key_hint || maskApiKey(decryptedKey),
          };
        } catch (decryptErr) {
          console.warn('[AI Router] Failed to decrypt user BYOK key, falling back to platform:', decryptErr);
        }
      }
    } catch (err) {
      console.warn('[AI Router] Exception reading user BYOK key:', err);
    }
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

  // Product Manager: Strictly uses Google Gemini
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
    'No Gemini API key is configured. Please configure your Gemini API Key in Profile or set GEMINI_API_KEY in the server environment.'
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
