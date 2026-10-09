import { HfInference } from '@huggingface/inference';
import { DEVELOPER_IDE_CONFIG } from './developer-ide-config';

export interface TokenUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

export interface GenerateParams {
  systemPrompt?: string;
  userPrompt: string;
  model: string;
  apiKey: string;
  temperature?: number;
  maxOutputTokens?: number;
  jsonSchema?: Record<string, unknown>;
  responseMimeType?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  stream?: boolean;
  onChunk?: (chunk: string) => void;
}

export interface GenerateResult {
  text: string;
  parsedJson?: unknown;
  usage: TokenUsage;
  model: string;
  finishReason?: string;
  reasoningContent?: string;
}

export interface AIProvider {
  id: string;
  name: string;
  supportedModels: string[];
  generate(params: GenerateParams): Promise<GenerateResult>;
}

export class GeminiProvider implements AIProvider {
  id = 'google-gemini';
  name = 'Google Gemini';
  supportedModels = [
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ];

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const {
      systemPrompt,
      userPrompt,
      model,
      apiKey,
      temperature = 0.2,
      maxOutputTokens = 65536,
      jsonSchema,
      responseMimeType = jsonSchema ? 'application/json' : 'text/plain',
    } = params;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const generationConfig: Record<string, unknown> = {
      temperature,
      maxOutputTokens,
      responseMimeType,
      thinkingConfig: { thinkingBudget: 0 },
    };

    if (jsonSchema) {
      generationConfig.responseSchema = jsonSchema;
    }

    const contents = [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ];

    const bodyPayload: Record<string, unknown> = {
      contents,
      generationConfig,
    };

    if (systemPrompt) {
      bodyPayload.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    let response: Response | undefined;
    let failureText = '';
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(bodyPayload),
        });

        if (response.ok) break;

        failureText = (await response.text()).slice(0, 800);
        const isQuotaExceeded =
          response.status === 429 &&
          (failureText.toLowerCase().includes('quota') ||
            failureText.toLowerCase().includes('billing') ||
            failureText.toLowerCase().includes('exceeded'));

        if (isQuotaExceeded) {
          throw new Error('Gemini API quota exceeded for the configured API key.');
        }

        const isRetryable = [429, 500, 502, 503, 504].includes(response.status);
        if (!isRetryable || attempt === maxAttempts - 1) break;

        const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('quota')) throw err;
        failureText = err instanceof Error ? err.message : 'Network error';
        if (attempt === maxAttempts - 1) break;
        const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!response?.ok) {
      throw new Error(`Gemini request failed (${response?.status ?? 'network'}): ${failureText}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      usageMetadata?: {
        candidatesTokenCount?: number;
        promptTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const candidate = payload.candidates?.[0];
    if (!candidate) {
      throw new Error('Gemini returned no candidates in response.');
    }

    const rawText = (candidate.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    const usage: TokenUsage = {
      promptTokens: payload.usageMetadata?.promptTokenCount || 0,
      candidatesTokens: payload.usageMetadata?.candidatesTokenCount || 0,
      totalTokens:
        payload.usageMetadata?.totalTokenCount ||
        (payload.usageMetadata?.promptTokenCount || 0) +
        (payload.usageMetadata?.candidatesTokenCount || 0),
    };

    let parsedJson: unknown;
    if (responseMimeType === 'application/json' && rawText) {
      let cleaned = rawText;
      if (cleaned.startsWith('```')) {
        const match = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
        cleaned = match ? match[1].trim() : cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }
      try {
        parsedJson = JSON.parse(cleaned);
      } catch {
        // Will throw upstream if JSON parsing was strictly required
      }
    }

    return {
      text: rawText,
      parsedJson,
      usage,
      model,
      finishReason: candidate.finishReason,
    };
  }
}

/**
 * Hugging Face Inference Providers for Developer IDE
 * Model: Qwen/Qwen3-Coder-480B-A35B-Instruct
 */
export class HuggingFaceProvider implements AIProvider {
  id = 'huggingface';
  name = 'Hugging Face';
  supportedModels = [
    DEVELOPER_IDE_CONFIG.model,
  ];

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const {
      systemPrompt,
      userPrompt,
      model = DEVELOPER_IDE_CONFIG.model,
      apiKey,
      temperature = 0.2,
      maxOutputTokens = 4096,
      responseMimeType = 'application/json',
    } = params;

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const hf = new HfInference(apiKey);
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await hf.chatCompletion({
          model,
          messages,
          temperature,
          max_tokens: maxOutputTokens,
        });

        const choice = response.choices?.[0];
        if (!choice || !choice.message) {
          throw new Error('Hugging Face returned no choices in response.');
        }

        const rawText = (choice.message.content ?? '').trim();
        const usage: TokenUsage = {
          promptTokens: response.usage?.prompt_tokens || 0,
          candidatesTokens: response.usage?.completion_tokens || 0,
          totalTokens:
            response.usage?.total_tokens ||
            ((response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0)),
        };

        let parsedJson: unknown;
        if (responseMimeType === 'application/json' && rawText) {
          let cleaned = rawText;
          if (cleaned.startsWith('```')) {
            const match = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
            cleaned = match ? match[1].trim() : cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          }
          try {
            parsedJson = JSON.parse(cleaned);
          } catch {
            // Handled upstream
          }
        }

        return {
          text: rawText,
          parsedJson,
          usage,
          model,
          finishReason: choice.finish_reason,
        };
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const status = (err as { httpResponse?: { status?: number } })?.httpResponse?.status;

        if (
          status === 401 ||
          errMsg.toLowerCase().includes('invalid username or password') ||
          errMsg.toLowerCase().includes('unauthorized')
        ) {
          throw new Error('Hugging Face API authentication failed. Check the server-side HF_TOKEN configuration.');
        }

        if (
          status === 402 ||
          errMsg.toLowerCase().includes('quota') ||
          errMsg.toLowerCase().includes('balance') ||
          errMsg.toLowerCase().includes('insufficient')
        ) {
          throw new Error('Hugging Face API credits or balance is insufficient. Please check billing or token settings.');
        }

        const isRetryable =
          status === 429 ||
          [500, 502, 503, 504].includes(status ?? 0) ||
          errMsg.toLowerCase().includes('network') ||
          errMsg.toLowerCase().includes('fetch failed');

        if (!isRetryable || attempt === maxAttempts - 1) {
          break;
        }

        const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (lastError) {
      const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
      const status = (lastError as { httpResponse?: { status?: number } })?.httpResponse?.status;

      if (
        status === 401 ||
        errMsg.toLowerCase().includes('invalid username or password') ||
        errMsg.toLowerCase().includes('unauthorized')
      ) {
        throw new Error('Hugging Face API authentication failed. Check the server-side HF_TOKEN configuration.');
      }
      if (
        status === 402 ||
        errMsg.toLowerCase().includes('quota') ||
        errMsg.toLowerCase().includes('balance') ||
        errMsg.toLowerCase().includes('insufficient')
      ) {
        throw new Error('Hugging Face API credits or balance is insufficient. Please check billing or token settings.');
      }
      if (status === 429) {
        throw new Error('Hugging Face API rate limit reached. Please retry shortly.');
      }
      if (status && [500, 502, 503, 504].includes(status)) {
        throw new Error('Hugging Face Inference Provider is temporarily unavailable. Please retry.');
      }
      throw new Error(`Hugging Face request failed: ${errMsg}`);
    }

    throw new Error('Hugging Face Inference Provider is temporarily unavailable. Please retry.');
  }
}
