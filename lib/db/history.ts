import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, GenerationHistory } from '../types/database';
import { DEVELOPER_IDE_CONFIG } from '../ai/developer-ide-config';

export type LogGenerationInput = {
  projectId: string;
  userId: string;
  prompt: string;
  model?: string;
  status?: string;
};

/**
 * Record a prompt and AI code generation entry.
 */
export async function logGeneration(
  supabase: SupabaseClient<Database>,
  input: LogGenerationInput
): Promise<{ data: GenerationHistory | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('generation_history')
      .insert({
        project_id: input.projectId,
        user_id: input.userId,
        prompt: input.prompt.trim(),
        model: input.model || DEVELOPER_IDE_CONFIG.fallbackModel,
        status: input.status || 'completed',
      })
      .select('*')
      .single();

    if (error) {
      console.warn('Note: generation_history insert fallback:', error.message);
      return { data: null, error: null };
    }

    return { data, error: null };
  } catch (err: unknown) {
    console.warn('Note: logGeneration fallback:', err);
    return { data: null, error: null };
  }
}

/**
 * Fetch generation history for a given project.
 */
export async function getProjectGenerations(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<{ data: GenerationHistory[] | null; error: Error | null }> {
  if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from('generation_history')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: null };
    }

    return { data: data || [], error: null };
  } catch (err: unknown) {
    return { data: [], error: null };
  }
}
