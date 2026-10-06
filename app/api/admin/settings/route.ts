import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin/auth';
import { getAdminSettings, updateAdminSettings } from '@/lib/admin/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await verifyAdmin();
  if (!auth.isAuthorized) {
    return NextResponse.json(
      { message: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  try {
    const settings = await getAdminSettings();
    return NextResponse.json({ settings });
  } catch (error: unknown) {
    console.error('[Admin Settings GET Exception]:', error);
    return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
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
    const body = await request.json();
    const updated = await updateAdminSettings(
      body,
      auth.user?.email || 'admin@codatron.ai',
      auth.user?.id
    );

    return NextResponse.json({
      success: true,
      message: 'Admin settings updated successfully.',
      settings: updated,
    });
  } catch (error: unknown) {
    console.error('[Admin Settings POST Exception]:', error);
    return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
  }
}
