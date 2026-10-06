import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserUsageSummary } from '@/lib/ai/usage';

export const runtime = 'nodejs';

/**
 * GET /api/profile/usage
 * Fetch real aggregated token usage for current authenticated user.
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

    const summary = await getUserUsageSummary(supabase, user.id);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (err) {
    console.error('[Usage API GET] Error:', err);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
