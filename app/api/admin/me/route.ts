import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json(
      { isAdmin: false, error: auth.error },
      { status: auth.status || 401 }
    );
  }

  return NextResponse.json({
    isAdmin: true,
    user: {
      id: auth.user?.id,
      email: auth.user?.email,
      role: 'admin',
    },
  });
}
