import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { createPrivilegedClient } from '@/lib/server';
import { logAdminAudit } from '@/lib/admin/telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json(
      { message: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
  const offset = (page - 1) * limit;

  const privileged = createPrivilegedClient();

  try {
    const adminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    let baseQuery = privileged
      .from('profiles')
      .select('id, email, full_name, credit_limit, credits_used, credits_reserved, updated_at', {
        count: 'exact',
      });

    if (query) {
      baseQuery = baseQuery.or(`email.ilike.%${query}%,full_name.ilike.%${query}%`);
    }

    const { data: users, count, error } = await baseQuery
      .order('email')
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Admin Credits API Error]:', error);
      return NextResponse.json({ message: 'Error fetching credits list.' }, { status: 500 });
    }

    const rows = ((users || []) as any[]).map((u) => {
      const limitVal = u.credit_limit || 20;
      const usedVal = u.credits_used || 0;
      const remaining = Math.max(0, limitVal - usedVal);
      const isAdmin = adminEmails.includes(u.email?.toLowerCase());
      const role = u.role || (isAdmin ? 'admin' : 'user');
      return {
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role,
        creditLimit: limitVal,
        creditsUsed: usedVal,
        creditsReserved: u.credits_reserved || 0,
        creditsRemaining: role === 'admin' ? 999999 : remaining,
        updatedAt: u.updated_at,
      };
    });

    return NextResponse.json({
      credits: rows,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error: unknown) {
    console.error('[Admin Credits GET Exception]:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json(
      { message: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  try {
    const body = (await request.json()) as {
      userId?: string;
      action?: 'add' | 'remove' | 'set' | 'reset';
      amount?: number;
      reason?: string;
    };

    if (!body.userId) {
      return NextResponse.json({ message: 'Target userId is required.' }, { status: 400 });
    }

    const privileged = createPrivilegedClient();
    const { data: profile, error: profileErr } = await privileged
      .from('profiles')
      .select('id, email, credit_limit, credits_used')
      .eq('id', body.userId)
      .maybeSingle();

    if (profileErr || !profile) {
      return NextResponse.json({ message: 'Target user profile not found.' }, { status: 404 });
    }

    const currentLimit = profile.credit_limit || 20;
    const currentUsed = profile.credits_used || 0;
    const currentRemaining = Math.max(0, currentLimit - currentUsed);
    const amount = typeof body.amount === 'number' ? Math.floor(body.amount) : 0;

    let newLimit = currentLimit;
    let newUsed = currentUsed;

    switch (body.action) {
      case 'add': {
        if (amount <= 0) {
          return NextResponse.json({ message: 'Amount to add must be positive.' }, { status: 400 });
        }
        newLimit = currentLimit + amount;
        break;
      }
      case 'remove': {
        if (amount <= 0) {
          return NextResponse.json({ message: 'Amount to remove must be positive.' }, { status: 400 });
        }
        // Deduct from limit, ensuring limit doesn't drop below credits_used or 0
        newLimit = Math.max(currentUsed, currentLimit - amount);
        break;
      }
      case 'set': {
        if (amount < 0) {
          return NextResponse.json({ message: 'Credits limit cannot be negative.' }, { status: 400 });
        }
        newLimit = amount;
        if (newUsed > newLimit) {
          newUsed = newLimit;
        }
        break;
      }
      case 'reset': {
        // Reset usage back to 0
        newUsed = 0;
        break;
      }
      default:
        return NextResponse.json(
          { message: 'Invalid action. Allowed: "add", "remove", "set", "reset".' },
          { status: 400 }
        );
    }

    const { error: updateErr } = await privileged
      .from('profiles')
      .update({
        credit_limit: newLimit,
        credits_used: newUsed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.userId);

    if (updateErr) {
      console.error('[Admin Credit Update Error]:', updateErr);
      return NextResponse.json({ message: 'Failed to update credits.' }, { status: 500 });
    }

    const newRemaining = Math.max(0, newLimit - newUsed);

    // Audit log this administrative action
    await logAdminAudit({
      adminUserId: auth.user?.id,
      adminEmail: auth.user?.email || 'admin@codatron.ai',
      action: 'CREDITS_ADJUSTED',
      targetType: 'user_credits',
      targetId: body.userId,
      details: {
        targetEmail: profile.email,
        adjustmentAction: body.action,
        amount: body.amount,
        previousLimit: currentLimit,
        previousUsed: currentUsed,
        previousRemaining: currentRemaining,
        newLimit,
        newUsed,
        newRemaining,
        reason: body.reason || 'Admin manual adjustment',
      },
    });

    return NextResponse.json({
      success: true,
      message: `Credits successfully updated for ${profile.email}.`,
      creditLimit: newLimit,
      creditsUsed: newUsed,
      creditsRemaining: newRemaining,
    });
  } catch (error: unknown) {
    console.error('[Admin Credits POST Exception]:', error);
    return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
  }
}
