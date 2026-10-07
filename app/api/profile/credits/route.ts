import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserCreditBalance } from '@/lib/credits/manager';

export const runtime = 'nodejs';

/**
 * GET /api/profile/credits
 * Returns the current authenticated user's credit quota and balance.
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

    const balance = await getUserCreditBalance(supabase, user.id, user.email);

    return NextResponse.json({
      success: true,
      limit: balance.limit,
      used: balance.used,
      remaining: balance.remaining,
      reserved: balance.reserved,
      createdAt: balance.createdAt,
      isAdmin: Boolean(balance.isAdmin),
      isUnlimited: Boolean(balance.isAdmin),
      plan: balance.plan || 'free',
    });
  } catch (err) {
    console.error('[Credits API] Error:', err);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
