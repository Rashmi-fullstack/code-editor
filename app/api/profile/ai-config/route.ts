import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getCurrentUser } from '@/lib/auth';
import { encryptApiKey, maskApiKey } from '@/lib/ai/crypto';
import { DEVELOPER_IDE_CONFIG } from '@/lib/ai/developer-ide-config';

export const runtime = 'nodejs';

/**
 * GET /api/profile/ai-config
 * Fetch current user's AI configuration metadata (safely masked, no plaintext keys!).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user: sbUser },
    } = await supabase.auth.getUser();

    const sessionUser = await getCurrentUser();
    const user = sbUser || sessionUser;

    if (!user) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_ai_keys')
      .select('provider, model, key_hint, is_active, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('[AI Config GET] DB error:', error.message);
    }

    const isConfigured = Boolean(data && data.is_active);

    return NextResponse.json({
      provider: data?.provider || DEVELOPER_IDE_CONFIG.provider,
      model: data?.model || DEVELOPER_IDE_CONFIG.model,
      keyConfigured: isConfigured,
      maskedKey: isConfigured ? data?.key_hint : null,
      keySource: isConfigured ? 'byok' : 'platform',
      updatedAt: data?.updated_at || null,
    });
  } catch (err) {
    console.error('[AI Config GET] Error:', err);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/profile/ai-config
 * Save and validate a personal API key (BYOK).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user: sbUser },
    } = await supabase.auth.getUser();

    const sessionUser = await getCurrentUser();
    const user = sbUser || sessionUser;

    if (!user) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    const body = (await request.json()) as {
      apiKey?: string;
      provider?: string;
      model?: string;
    };

    const rawKey = body.apiKey?.trim();
    if (!rawKey || rawKey.length < 10) {
      return NextResponse.json(
        { message: 'Please provide a valid API key (minimum 10 characters).' },
        { status: 400 }
      );
    }

    const provider = body.provider || DEVELOPER_IDE_CONFIG.provider;
    const model = body.model || (provider === 'huggingface' ? DEVELOPER_IDE_CONFIG.model : DEVELOPER_IDE_CONFIG.fallbackModel);

    // Verify key with Gemini if google-gemini
    if (provider === 'google-gemini') {
      try {
        const verifyUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const testRes = await fetch(verifyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': rawKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'ping' }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        });

        if (!testRes.ok) {
          const errText = await testRes.text();
          if (testRes.status === 400 || testRes.status === 403) {
            return NextResponse.json(
              { message: 'API key validation failed: The key appears to be invalid or unauthorized.' },
              { status: 400 }
            );
          }
          if (testRes.status === 429) {
            return NextResponse.json(
              { message: 'API key quota exceeded or rate limited upstream.' },
              { status: 429 }
            );
          }
          console.warn('[AI Config Verify] Upstream error:', errText.slice(0, 200));
        }
      } catch (verifyErr) {
        console.warn('[AI Config Verify] Network test skipped:', verifyErr);
      }
    } else if (provider === 'huggingface') {
      try {
        const { HfInference } = await import('@huggingface/inference');
        const hf = new HfInference(rawKey);
        await hf.chatCompletion({
          model: model || DEVELOPER_IDE_CONFIG.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        });
      } catch (verifyErr: unknown) {
        const errMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        const status = (verifyErr as { httpResponse?: { status?: number } })?.httpResponse?.status;
        if (status === 401 || errMsg.toLowerCase().includes('invalid username or password') || errMsg.toLowerCase().includes('unauthorized')) {
          return NextResponse.json(
            { message: 'Hugging Face API token validation failed: The token is unauthorized or invalid.' },
            { status: 400 }
          );
        }
        if (status === 402 || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('insufficient')) {
          return NextResponse.json(
            { message: 'Hugging Face API token has insufficient credits or quota.' },
            { status: 429 }
          );
        }
        console.warn('[AI Config Verify] Hugging Face upstream error:', errMsg.slice(0, 200));
      }
    }

    // Encrypt the key server-side before storing
    const encryptedKey = encryptApiKey(rawKey);
    const keyHint = maskApiKey(rawKey);

    const { error: upsertError } = await supabase.from('user_ai_keys').upsert(
      {
        user_id: user.id,
        provider,
        model,
        encrypted_key: encryptedKey,
        key_hint: keyHint,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );

    if (upsertError) {
      console.error('[AI Config POST] Upsert error:', upsertError);
      return NextResponse.json(
        { message: `Failed to save configuration: ${upsertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Personal API key configured and encrypted successfully.',
      provider,
      model,
      keyConfigured: true,
      maskedKey: keyHint,
      keySource: 'byok',
    });
  } catch (err) {
    console.error('[AI Config POST] Error:', err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/profile/ai-config
 * Remove user's personal API key and revert to Platform Key.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user: sbUser },
    } = await supabase.auth.getUser();

    const sessionUser = await getCurrentUser();
    const user = sbUser || sessionUser;

    if (!user) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    const { error } = await supabase
      .from('user_ai_keys')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('[AI Config DELETE] DB error:', error);
      return NextResponse.json({ message: 'Failed to delete configuration' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Personal API key removed. Reverted to Platform API key.',
      keyConfigured: false,
      keySource: 'platform',
    });
  } catch (err) {
    console.error('[AI Config DELETE] Error:', err);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
