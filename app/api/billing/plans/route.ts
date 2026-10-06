import { NextResponse } from 'next/server';
import { getActivePlans } from '@/lib/billing/plans';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const plans = await getActivePlans();
    return NextResponse.json({ plans });
  } catch (error: unknown) {
    console.error('[Public Plans GET Exception]:', error);
    return NextResponse.json({ message: 'Failed to fetch subscription plans' }, { status: 500 });
  }
}
