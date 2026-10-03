import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { DEFAULT_GEMINI_MODEL } from '@/lib/ai/coding-agent';
import { resolveAIConfig, trackAiUsage } from '@/lib/ai/router';
import { reserveCredit, finalizeCredit } from '@/lib/credits/manager';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { url, topic } = await req.json();

    if (!url && !topic) {
      return NextResponse.json({ error: 'URL or topic is required' }, { status: 400 });
    }

    // 1. Strict Server-Side Authentication
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required to perform AI research.' },
        { status: 401 }
      );
    }

    // 2. Server-Side Atomic Credit Reservation
    const creditReservation = await reserveCredit(supabase, user.id);
    if (!creditReservation.success) {
      return NextResponse.json(
        {
          error:
            creditReservation.message ||
            'No AI credits remaining. Your initial credit limit has been reached.',
        },
        { status: 403 }
      );
    }

    const firecrawlKey = process.env.FIRECRAWL_API_KEY?.trim();
    let rawContent = '';

    if (firecrawlKey && url) {
      try {
        const firecrawlRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${firecrawlKey}`,
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
          }),
        });

        if (firecrawlRes.ok) {
          const data = await firecrawlRes.json();
          rawContent = data.data?.markdown || data.data?.content || '';
        }
      } catch (err) {
        console.warn('Firecrawl scrape error, falling back to Gemini synthesis:', err);
      }
    }

    const startTime = Date.now();
    let aiConfig;
    try {
      aiConfig = await resolveAIConfig(supabase, user.id);
    } catch {
      aiConfig = null;
    }

    if (!aiConfig?.apiKey) {
      await finalizeCredit(supabase, user.id, false);
      return NextResponse.json({
        marketAnalysis: 'Market analysis synthesized from industry standards.',
        competitiveBenchmarks: ['Leading player features', 'Differentiation opportunities'],
        userInsights: ['Users demand high performance and clean workflows'],
        sourceUrl: url || null,
      });
    }

    let isCreditFinalized = false;

    try {
      const systemPrompt = `You are a Principal Product Researcher. Analyze the provided topic or webpage content and extract structured product research insights.
Return ONLY valid JSON matching this schema:
{
  "marketAnalysis": "Detailed 2-3 paragraph breakdown of market dynamics, opportunities, and user demand",
  "competitiveBenchmarks": ["Benchmark 1 with key strengths", "Benchmark 2 with key gaps"],
  "userInsights": ["Key pain point or workflow insight 1", "Key pain point or workflow insight 2"],
  "recommendations": ["Actionable product recommendation 1", "Actionable product recommendation 2"]
}`;

      const promptText = rawContent
        ? `Analyze this scraped webpage content from ${url}:\n\n${rawContent.slice(0, 10000)}`
        : `Analyze this product topic and competitive landscape:\nTopic: ${topic || url}`;

      const model = aiConfig.model || process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
      const aiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const aiRes = await fetch(aiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': aiConfig.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
        }),
      });

      if (!aiRes.ok) {
        throw new Error(`AI generation failed with status ${aiRes.status}`);
      }

      const aiData = await aiRes.json();
      const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = JSON.parse(text);

      const inputTokens = aiData.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = aiData.usageMetadata?.candidatesTokenCount ?? 0;
      const totalTokens = aiData.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens;

      // Finalize credit on success
      await finalizeCredit(supabase, user.id, true);
      isCreditFinalized = true;

      await trackAiUsage(supabase, {
        userId: user.id,
        config: aiConfig,
        operation: 'ANALYZE',
        inputTokens,
        outputTokens,
        totalTokens,
        success: true,
        creditUsed: 1,
        latencyMs: Date.now() - startTime,
      });

      return NextResponse.json({
        ...parsed,
        sourceUrl: url || null,
      });
    } catch (operationError) {
      if (!isCreditFinalized) {
        await finalizeCredit(supabase, user.id, false);
        isCreditFinalized = true;
      }
      throw operationError;
    }
  } catch (error) {
    console.error('Research API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to conduct research' },
      { status: 500 }
    );
  }
}