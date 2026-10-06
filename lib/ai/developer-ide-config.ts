/**
 * Authoritative AI Provider Configuration for Developer IDE
 *
 * Primary: Hugging Face Inference Providers (Qwen/Qwen3-Coder-480B-A35B-Instruct)
 * Fallback: Google Gemini (existing configured Gemini model)
 * All UI indicators (status bar, workspace badge, AI chat, generation history, error messages)
 * derive from this central configuration.
 */

export const DEVELOPER_IDE_CONFIG = {
  provider: 'huggingface',
  model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  displayName: 'Qwen3-Coder • Hugging Face',
  fallbackProvider: 'google-gemini',
  fallbackModel: (process.env.GEMINI_MODEL?.trim() && process.env.GEMINI_MODEL.trim() !== 'gemini-3.6-flash') ? process.env.GEMINI_MODEL.trim() : 'gemini-2.5-flash',
  fallbackDisplayName: 'Gemini • Fallback',
} as const;

export type DeveloperIdeConfig = typeof DEVELOPER_IDE_CONFIG;
