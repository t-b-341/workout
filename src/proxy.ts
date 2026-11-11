import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isUserAllowed } from '@/lib/authAllowlist';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/_next', '/favicon.ico', '/manifest.webmanifest', '/icons'];

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => url.pathname.startsWith(p));

  if (process.env.NEXT_PUBLIC_E2E_STUB === '1' && process.env.NODE_ENV !== 'production') {
    const signedIn = request.cookies.get('e2e-user')?.value === '1';
    if (!signedIn && !isPublic) {
      const loginUrl = url.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', url.pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const loginUrl = url.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', url.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Defense-in-depth: authenticated but not on the allowlist → sign-out redirect.
  if (user && !isPublic && !isUserAllowed(user.id)) {
    const denyUrl = url.clone();
    denyUrl.pathname = '/login';
    denyUrl.search = '';
    denyUrl.searchParams.set('error', 'not_allowed');
    return NextResponse.redirect(denyUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)'],
};
