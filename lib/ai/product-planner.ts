export interface DevelopmentTask {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  type: string;
  category?: 'frontend' | 'backend' | 'component' | 'styling' | 'state';
  status: 'todo' | 'in-progress' | 'completed';
  requirements: string;
  acceptanceCriteria: string[];
  technicalPlan: {
    overview?: string;
    filesToCreate?: string[];
    filesToUpdate?: string[];
    steps?: string[];
  };
  affectedFiles: string[];
  dependencies: string[];
}

export interface ProductPlanAnalysis {
  summary: string;
  productType: string;
  primaryMarket: string;
  businessModel: string;
  complexity: 'Low' | 'Medium' | 'High' | 'Very High';
  recommendedMvp: string;
}

export interface ProductPlanSnapshot {
  productType: string;
  primaryUsers: string[];
  businessModel: string[];
  platform: string;
  localization?: string;
  complexity: string;
}

export interface UserJourney {
  role: string;
  steps: string[];
}

export interface PrioritizedFeature {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
  reason?: string;
  complexity?: string;
  effort?: string;
  dependencies?: string[];
  acceptanceCriteria?: string[];
}

export interface TechArchitecture {
  overview: string;
  diagramFlow?: Array<{ from: string; to: string; label?: string }>;
  layers?: Array<{ name: string; components: string[] }>;
}

export interface TechStackItem {
  category: string;
  technology: string;
  why: string;
  alternative: string;
  tradeoffs?: string;
  mvpEssential?: boolean;
}

export interface SystemComponent {
  name: string;
  description: string;
  status?: string;
}

export interface TeamRequirement {
  roles: Array<{ role: string; count: number }>;
  total: number;
  mvpTeam: string;
  productionTeam: string;
  soloNotes?: string;
}

export interface TimelinePhase {
  phase: string;
  duration: string;
  focus: string;
}

export interface DevelopmentTimeline {
  phases: TimelinePhase[];
  totalMvpWeeks: string;
}

export interface DemoArchitectureFlow {
  role: string;
  flow: string[];
}

export interface DemoArchitecture {
  summary: string;
  flows: DemoArchitectureFlow[];
}

export interface DataModelEntity {
  entity: string;
  description?: string;
  relations?: string[];
  fields?: string[];
}

export interface KeyRisk {
  level: 'High' | 'Medium' | 'Low';
  risk: string;
  impact: string;
  mitigation: string;
}

export interface AssumptionItem {
  userRequirement: string;
  aiInterpretation: string;
}

export interface BudgetCategory {
  category: string;
  estimateRange: string;
  basis: string;
  items: string[];
}

export interface BudgetPlan {
  currency: string;
  summary: string;
  assumptions: string[];
  categories: BudgetCategory[];
  operationalNotes?: string;
}

export interface AIAssistanceOpportunity {
  area: string;
  aiRole: string;
  humanReviewRequired: string;
  efficiencyGain: string;
}

export interface AIAssistancePlan {
  summary: string;
  opportunities: AIAssistanceOpportunity[];
  guidelines: string[];
}

export interface ProductPlan {
  originalIdea?: string;
  overview?: {
    summary: string;
    targetAudience: string;
    keyDifferentiator: string;
    problemSolved?: string;
    proposedSolution?: string;
    businessGoals?: string[];
  };
  analysis?: ProductPlanAnalysis;
  snapshot?: ProductPlanSnapshot;
  userJourneys?: UserJourney[];
  vision: {
    purpose: string;
    valueProposition: string;
    targetOutcome: string;
    workspaceName?: string;
  };
  personas: Array<{
    role: string;
    needs: string;
    painPoints: string;
    goals?: string;
  }>;
  mvp: {
    mustHave: string[];
    shouldHave?: string[];
    later?: string[];
    exclusions: string[];
  };
  features: PrioritizedFeature[];
  userStories: Array<{
    id: string;
    asA: string;
    iWant: string;
    soThat: string;
    acceptanceCriteria: string[];
  }>;
  acceptanceCriteria: string[];
  technicalArchitecture?: TechArchitecture;
  recommendedStack?: TechStackItem[];
  systemComponents?: SystemComponent[];
  teamRequirement?: TeamRequirement;
  timeline?: DevelopmentTimeline;
  roadmap: Array<{
    milestone: string;
    description: string;
    targetWeek?: string;
    features?: string[];
    status?: string;
    objectives?: string[];
    deliverables?: string[];
    dependencies?: string[];
    completionCriteria?: string;
    risks?: string[];
  }>;
  demoArchitecture?: DemoArchitecture;
  dataModel?: DataModelEntity[];
  risks?: KeyRisk[];
  assumptions?: AssumptionItem[];
  openQuestions?: string[];
  recommendations?: string[];
  nextActions?: string[];
  budget?: BudgetPlan;
  aiAssistance?: AIAssistancePlan;
  developmentTasks: DevelopmentTask[];
  requirements: {
    functional: string[];
    nonFunctional: string[];
  };
  research: {
    marketAnalysis: string;
    competitiveBenchmarks: string[];
    userInsights: string[];
  };
}

export type ProductPlannerErrorCode =
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTH_ERROR'
  | 'INVALID_RESPONSE'
  | 'NO_PROVIDER'
  | 'FAILED';

export class ProductPlannerError extends Error {
  code: ProductPlannerErrorCode;
  status: number;
  provider?: string;

  constructor(
    message: string,
    code: ProductPlannerErrorCode = 'FAILED',
    status: number = 500,
    provider?: string
  ) {
    super(message);
    this.name = 'ProductPlannerError';
    this.code = code;
    this.status = status;
    this.provider = provider;
  }
}

export interface ProductPlannerOptions {
  aiConfig?: { apiKey: string; model?: string; providerId?: string; keySource?: string };
  onUsage?: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void;
}

function cleanGeminiModel(m?: string): string {
  const model = m?.trim() || '';
  if (!model || model.includes('Qwen') || !model.startsWith('gemini-')) {
    return 'gemini-flash-latest';
  }
  return model;
}

interface ProviderCallResult {
  plan: ProductPlan | null;
  error?: {
    message: string;
    code: ProductPlannerErrorCode;
    status: number;
    provider: string;
  };
}

const SYSTEM_PROMPT = `You are a Principal AI Product Manager and Systems Architect at Codatron.ai.
Your mission is to transform the user's raw product idea into an authoritative, complete, production-grade AI Product Strategy and Technical Architecture Blueprint.

CRITICAL INSTRUCTIONS:
1. Tailor EVERY single section directly to the user's exact product idea and requirements.
   - For example: If the idea is "Zomato-like online restaurant platform with a Bengali touch", EVERY section (analysis, journeys, MVP, features, architecture, stack, data model, risks, recommendations) must be explicitly about restaurant discovery, Bengali regional localization/cuisine, customer ordering, delivery dispatch, and vendor administration.
   - NEVER generate generic, repetitive boilerplate (e.g. "Deliver high-performance capabilities" or generic SaaS text).
2. Clearly distinguish explicit user requirements from your strategic AI recommendations.
3. You must return ONLY valid, strictly parseable JSON adhering to the exact schema below.

JSON SCHEMA SPECIFICATION:
{
  "originalIdea": string,
  "overview": {
    "summary": string,
    "targetAudience": string,
    "keyDifferentiator": string,
    "problemSolved": string,
    "proposedSolution": string,
    "businessGoals": string[]
  },
  "analysis": {
    "summary": string,
    "productType": string,
    "primaryMarket": string,
    "businessModel": string,
    "complexity": "Low" | "Medium" | "High" | "Very High",
    "recommendedMvp": string
  },
  "snapshot": {
    "productType": string,
    "primaryUsers": string[],
    "businessModel": string[],
    "platform": string,
    "localization": string,
    "complexity": string
  },
  "userJourneys": [
    {
      "role": string,
      "steps": string[]
    }
  ],
  "vision": {
    "purpose": string,
    "valueProposition": string,
    "targetOutcome": string,
    "workspaceName": string
  },
  "personas": [
    {
      "role": string,
      "needs": string,
      "painPoints": string,
      "goals": string
    }
  ],
  "mvp": {
    "mustHave": string[],
    "shouldHave": string[],
    "later": string[],
    "exclusions": string[]
  },
  "features": [
    {
      "id": string,
      "title": string,
      "priority": "high" | "medium" | "low",
      "description": string,
      "reason": string,
      "complexity": "Low" | "Medium" | "High",
      "effort": string,
      "dependencies": string[],
      "acceptanceCriteria": string[]
    }
  ],
  "technicalArchitecture": {
    "overview": string,
    "diagramFlow": [
      { "from": string, "to": string, "label": string }
    ],
    "layers": [
      { "name": string, "components": string[] }
    ]
  },
  "recommendedStack": [
    {
      "category": string,
      "technology": string,
      "why": string,
      "alternative": string,
      "tradeoffs": string,
      "mvpEssential": boolean
    }
  ],
  "systemComponents": [
    {
      "name": string,
      "description": string,
      "status": string
    }
  ],
  "teamRequirement": {
    "roles": [
      { "role": string, "count": number }
    ],
    "total": number,
    "mvpTeam": string,
    "productionTeam": string,
    "soloNotes": string
  },
  "timeline": {
    "phases": [
      { "phase": string, "duration": string, "focus": string }
    ],
    "totalMvpWeeks": string
  },
  "roadmap": [
    {
      "milestone": string,
      "description": string,
      "targetWeek": string,
      "features": string[],
      "objectives": string[],
      "deliverables": string[],
      "completionCriteria": string,
      "risks": string[]
    }
  ],
  "budget": {
    "currency": string,
    "summary": string,
    "assumptions": string[],
    "categories": [
      {
        "category": string,
        "estimateRange": string,
        "basis": string,
        "items": string[]
      }
    ],
    "operationalNotes": string
  },
  "aiAssistance": {
    "summary": string,
    "opportunities": [
      {
        "area": string,
        "aiRole": string,
        "humanReviewRequired": string,
        "efficiencyGain": string
      }
    ],
    "guidelines": string[]
  },
  "demoArchitecture": {
    "summary": string,
    "flows": [
      { "role": string, "flow": string[] }
    ]
  },
  "dataModel": [
    {
      "entity": string,
      "description": string,
      "relations": string[],
      "fields": string[]
    }
  ],
  "risks": [
    {
      "level": "High" | "Medium" | "Low",
      "risk": string,
      "impact": string,
      "mitigation": string
    }
  ],
  "assumptions": [
    {
      "userRequirement": string,
      "aiInterpretation": string
    }
  ],
  "openQuestions": string[],
  "recommendations": string[],
  "nextActions": string[],
  "developmentTasks": [
    {
      "id": string,
      "title": string,
      "description": string,
      "priority": "high" | "medium" | "low",
      "type": "component" | "frontend" | "backend" | "styling" | "state",
      "category": "component" | "frontend" | "backend" | "styling" | "state",
      "status": "todo",
      "requirements": string,
      "acceptanceCriteria": string[],
      "technicalPlan": {
        "overview": string,
        "filesToCreate": string[],
        "filesToUpdate": string[],
        "steps": string[]
      },
      "affectedFiles": string[],
      "dependencies": string[]
    }
  ],
  "requirements": {
    "functional": string[],
    "nonFunctional": string[]
  },
  "research": {
    "marketAnalysis": string,
    "competitiveBenchmarks": string[],
    "userInsights": string[]
  }
}

INSTRUCTIONS FOR BUDGET & AI ASSISTANCE:
- In "budget": Present realistic, assumption-based cost categories (e.g. Development Effort, Cloud Infrastructure & Hosting, 3rd Party APIs/Services, Maintenance & Support). If exact pricing is unknown, specify ranges (e.g. "$50-$150/mo") and state assumptions clearly. Never invent false guarantees.
- In "aiAssistance": Outline concrete opportunities where AI can assist (Requirements Analysis, UI/UX ideation, Architecture Docs, Test Generation, Support Workflows). Clearly specify what still requires human engineering review, testing, and approval.

INSTRUCTIONS FOR ASSUMPTIONS & OPEN QUESTIONS:
- In "assumptions": Explicitly distinguish confirmed user requirements from your strategic AI assumptions.
- In "openQuestions": Identify 4-6 critical decisions/questions that need to be resolved prior to development.
- Do NOT output source code or code files. Focus purely on product strategy, features, architecture, and planning. Return ONLY raw JSON without markdown fencing.`;

async function callGeminiPlanner(
  idea: string,
  existingFilePaths: string[],
  geminiKey: string,
  primaryModel: string,
  options?: ProductPlannerOptions
): Promise<ProviderCallResult> {
  const candidateModels = [
    primaryModel,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-flash-latest',
  ].filter((m, idx, self) => Boolean(m) && self.indexOf(m) === idx);

  let lastError: ProviderCallResult['error'] = undefined;

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: JSON.stringify({
                productIdea: idea,
                existingFiles: existingFilePaths,
              }),
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body,
        });

        if (!response.ok) {
          const failureText = (await response.text()).slice(0, 500);
          console.warn(
            `[Product Planner] Gemini model "${model}" attempt ${attempt + 1} HTTP ${response.status}: ${failureText}`
          );

          if (response.status === 429 || failureText.toLowerCase().includes('quota') || failureText.toLowerCase().includes('rate limit')) {
            lastError = {
              message: 'Gemini API rate limit reached (HTTP 429). The AI provider has reached its current usage limit.',
              code: 'RATE_LIMITED',
              status: 429,
              provider: 'google-gemini',
            };
            break; // No point retrying same model on 429
          }

          if (response.status === 401 || response.status === 403) {
            lastError = {
              message: 'Invalid or unauthorized Google Gemini API key (HTTP 401/403).',
              code: 'AUTH_ERROR',
              status: response.status,
              provider: 'google-gemini',
            };
            break;
          }

          if ([502, 503, 504].includes(response.status)) {
            lastError = {
              message: `Gemini API service is temporarily unavailable (HTTP ${response.status}).`,
              code: 'PROVIDER_UNAVAILABLE',
              status: response.status,
              provider: 'google-gemini',
            };
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 600));
              continue;
            }
          } else {
            lastError = {
              message: `Gemini API error (HTTP ${response.status}): ${failureText}`,
              code: 'FAILED',
              status: response.status,
              provider: 'google-gemini',
            };
          }
          break; // Try next candidate model
        }

        const payload = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: {
            candidatesTokenCount?: number;
            promptTokenCount?: number;
            totalTokenCount?: number;
          };
        };

        if (options?.onUsage && payload.usageMetadata) {
          const inputTokens = payload.usageMetadata.promptTokenCount ?? 0;
          const outputTokens = payload.usageMetadata.candidatesTokenCount ?? 0;
          const totalTokens = payload.usageMetadata.totalTokenCount ?? (inputTokens + outputTokens);
          options.onUsage({ inputTokens, outputTokens, totalTokens });
        }

        const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
        if (!text) {
          lastError = {
            message: 'Gemini returned an empty response body.',
            code: 'INVALID_RESPONSE',
            status: 502,
            provider: 'google-gemini',
          };
          break;
        }

        let cleaned = text.trim();
        if (cleaned.startsWith('```')) {
          const match = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
          cleaned = match ? match[1].trim() : cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        }

        try {
          const plan = JSON.parse(cleaned) as ProductPlan;
          if (plan.vision && Array.isArray(plan.features) && Array.isArray(plan.developmentTasks)) {
            plan.originalIdea = idea.trim();
            console.log(`[Product Planner] Successfully generated product plan via Gemini model "${model}".`);
            return { plan };
          } else {
            lastError = {
              message: 'Gemini returned JSON that does not match the product specification schema.',
              code: 'INVALID_RESPONSE',
              status: 502,
              provider: 'google-gemini',
            };
          }
        } catch (jsonErr) {
          lastError = {
            message: `Failed to parse Gemini response as JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
            code: 'INVALID_RESPONSE',
            status: 502,
            provider: 'google-gemini',
          };
        }
      } catch (err) {
        console.warn(`[Product Planner] Gemini model "${model}" error:`, err instanceof Error ? err.message : err);
        lastError = {
          message: err instanceof Error ? err.message : 'Network error communicating with Google Gemini.',
          code: 'PROVIDER_UNAVAILABLE',
          status: 503,
          provider: 'google-gemini',
        };
        break;
      }
    }
  }

  return { plan: null, error: lastError };
}

async function callHuggingFacePlanner(
  idea: string,
  existingFilePaths: string[],
  token: string,
  preferredModel?: string,
  options?: ProductPlannerOptions
): Promise<ProviderCallResult> {
  const models = [
    preferredModel,
    'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    'Qwen/Qwen2.5-72B-Instruct',
    'meta-llama/Llama-3.1-70B-Instruct',
    'Qwen/Qwen2.5-Coder-32B-Instruct',
  ].filter((m): m is string => Boolean(m));

  const candidateModels = models.filter((m, idx, self) => self.indexOf(m) === idx);
  let lastError: ProviderCallResult['error'] = undefined;

  for (const model of candidateModels) {
    try {
      console.log(`[Product Planner] Trying Hugging Face model: ${model}...`);
      const { HfInference } = await import('@huggingface/inference');
      const hf = new HfInference(token);

      const response = await hf.chatCompletion({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({ productIdea: idea, existingFiles: existingFilePaths }),
          },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      });

      const choice = response.choices?.[0];
      const rawText = choice?.message?.content?.trim() || '';
      if (!rawText) {
        lastError = {
          message: `Hugging Face model "${model}" returned an empty response.`,
          code: 'INVALID_RESPONSE',
          status: 502,
          provider: 'huggingface',
        };
        continue;
      }

      let cleaned = rawText;
      if (cleaned.startsWith('```')) {
        const match = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
        cleaned = match ? match[1].trim() : cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }

      try {
        const plan = JSON.parse(cleaned) as ProductPlan;
        if (plan.vision && Array.isArray(plan.features) && Array.isArray(plan.developmentTasks)) {
          plan.originalIdea = idea.trim();
          console.log(`[Product Planner] Successfully generated product plan via Hugging Face model "${model}".`);
          if (options?.onUsage && response.usage) {
            options.onUsage({
              inputTokens: response.usage.prompt_tokens || 0,
              outputTokens: response.usage.completion_tokens || 0,
              totalTokens: response.usage.total_tokens || 0,
            });
          }
          return { plan };
        } else {
          lastError = {
            message: `Hugging Face model "${model}" returned JSON missing required schema fields.`,
            code: 'INVALID_RESPONSE',
            status: 502,
            provider: 'huggingface',
          };
        }
      } catch (jsonErr) {
        lastError = {
          message: `Failed to parse Hugging Face response as JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
          code: 'INVALID_RESPONSE',
          status: 502,
          provider: 'huggingface',
        };
      }
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      console.warn(`[Product Planner] Hugging Face model "${model}" error:`, errStr);

      const isRateLimit = errStr.includes('429') || errStr.toLowerCase().includes('rate limit') || errStr.toLowerCase().includes('quota');
      const isAuth = errStr.includes('401') || errStr.includes('403') || errStr.toLowerCase().includes('unauthorized') || errStr.toLowerCase().includes('invalid token');

      lastError = {
        message: isRateLimit
          ? 'Hugging Face API rate limit reached (HTTP 429).'
          : isAuth
          ? 'Invalid or unauthorized Hugging Face token.'
          : `Hugging Face API unavailable: ${errStr}`,
        code: isRateLimit ? 'RATE_LIMITED' : isAuth ? 'AUTH_ERROR' : 'PROVIDER_UNAVAILABLE',
        status: isRateLimit ? 429 : isAuth ? 401 : 503,
        provider: 'huggingface',
      };
    }
  }

  return { plan: null, error: lastError };
}

export async function runProductManagerAgent(
  idea: string,
  existingFilePaths: string[],
  options?: ProductPlannerOptions
): Promise<ProductPlan> {
  const isHuggingFace = options?.aiConfig?.providerId === 'huggingface';

  let primaryError: ProviderCallResult['error'] = undefined;

  // 1. Primary: Hugging Face
  if (isHuggingFace) {
    const hfToken = options?.aiConfig?.apiKey || process.env.HF_TOKEN?.trim();
    if (hfToken) {
      const result = await callHuggingFacePlanner(idea, existingFilePaths, hfToken, options?.aiConfig?.model, options);
      if (result.plan) return result.plan;
      primaryError = result.error;
      console.warn('[Product Planner] Hugging Face failed. Trying fallback to Google Gemini...');
    }

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
      const result = await callGeminiPlanner(idea, existingFilePaths, geminiKey, 'gemini-flash-latest', options);
      if (result.plan) return result.plan;
      // If Gemini also failed, throw the definitive error
      const finalError = result.error || primaryError;
      throw new ProductPlannerError(
        finalError?.message || 'Unable to generate product plan: both Hugging Face and Google Gemini APIs failed.',
        finalError?.code || 'FAILED',
        finalError?.status || 500,
        finalError?.provider || 'all'
      );
    }
  } else {
    // 2. Primary: Google Gemini
    const geminiKey =
      options?.aiConfig?.providerId === 'google-gemini'
        ? options.aiConfig.apiKey
        : process.env.GEMINI_API_KEY?.trim();

    if (geminiKey) {
      const primaryModel = cleanGeminiModel(options?.aiConfig?.model || process.env.GEMINI_MODEL);
      const result = await callGeminiPlanner(idea, existingFilePaths, geminiKey, primaryModel, options);
      if (result.plan) return result.plan;
      primaryError = result.error;
      console.warn('[Product Planner] Gemini request failed. Trying fallback to Hugging Face...');
    }

    // Fallback: Hugging Face API
    const hfToken = process.env.HF_TOKEN?.trim();
    if (hfToken) {
      console.log('[Product Planner] Trying Hugging Face fallback...');
      const result = await callHuggingFacePlanner(
        idea,
        existingFilePaths,
        hfToken,
        'Qwen/Qwen3-Coder-480B-A35B-Instruct',
        options
      );
      if (result.plan) return result.plan;
      const finalError = result.error || primaryError;
      throw new ProductPlannerError(
        finalError?.message || 'Unable to generate product plan: both Google Gemini and Hugging Face APIs failed.',
        finalError?.code || 'FAILED',
        finalError?.status || 500,
        finalError?.provider || 'all'
      );
    }
  }

  // 3. If we reach here, all providers failed or no provider keys were configured.
  // NEVER FABRICATE FAKE FALLBACK PLANS.
  const errorToThrow = primaryError || {
    message: 'No valid AI provider configured. Please configure your Google Gemini API key or Hugging Face token.',
    code: 'NO_PROVIDER' as ProductPlannerErrorCode,
    status: 503,
    provider: 'none',
  };

  throw new ProductPlannerError(
    errorToThrow.message,
    errorToThrow.code,
    errorToThrow.status,
    errorToThrow.provider
  );
}