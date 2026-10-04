import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/middleware';

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next (Next.js internals and static files)
     * - __nextjs (Next.js dev tools and internals)
     * - webcontainer (WebContainer connect handshake)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - images / static assets (.svg, .png, .jpg, .jpeg, .gif, .webp)
     */
    '/((?!api|_next|__nextjs|webcontainer|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
