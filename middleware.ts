import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SIX_HOURS_IN_SECONDS = 6 * 60 * 60 // 21,600 seconds (6 hours)
const SIX_HOURS_IN_MS = SIX_HOURS_IN_SECONDS * 1000
const SESSION_START_COOKIE = 'dnd_session_start'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        maxAge: SIX_HOURS_IN_SECONDS,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              maxAge: SIX_HOURS_IN_SECONDS,
            })
          )
        },
      },
    }
  )

  // IMPORTANT: Use getUser() instead of getSession() to securely validate the token with Supabase
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Guard protected routes
  const protectedPrefixes = ['/characters', '/campaigns', '/table', '/hub', '/board']
  const isProtected = protectedPrefixes.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  // 6-hour session expiration enforcement
  if (user) {
    const sessionStartStr = request.cookies.get(SESSION_START_COOKIE)?.value
    let isExpired = false

    if (sessionStartStr) {
      const sessionStart = parseInt(sessionStartStr, 10)
      if (isNaN(sessionStart) || Date.now() - sessionStart > SIX_HOURS_IN_MS) {
        isExpired = true
      }
    } else if (user.last_sign_in_at) {
      const lastSignIn = new Date(user.last_sign_in_at).getTime()
      if (!isNaN(lastSignIn) && Date.now() - lastSignIn > SIX_HOURS_IN_MS) {
        isExpired = true
      } else {
        // Stamp session start time cookie if not already set
        supabaseResponse.cookies.set(SESSION_START_COOKIE, (lastSignIn || Date.now()).toString(), {
          path: '/',
          maxAge: SIX_HOURS_IN_SECONDS,
          httpOnly: true,
          sameSite: 'lax',
        })
      }
    } else {
      supabaseResponse.cookies.set(SESSION_START_COOKIE, Date.now().toString(), {
        path: '/',
        maxAge: SIX_HOURS_IN_SECONDS,
        httpOnly: true,
        sameSite: 'lax',
      })
    }

    if (isExpired) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`
      url.pathname = '/login'
      url.search = ''
      url.searchParams.set('reason', 'session-expired')
      if (isProtected && nextPath !== '/hub') {
        url.searchParams.set('next', nextPath)
      }

      const redirectResponse = NextResponse.redirect(url)
      redirectResponse.cookies.set(SESSION_START_COOKIE, '', { path: '/', maxAge: 0 })
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value)
      })
      return redirectResponse
    }
  } else {
    // If no authenticated user, ensure session cookie is cleared
    if (request.cookies.get(SESSION_START_COOKIE)) {
      supabaseResponse.cookies.set(SESSION_START_COOKIE, '', { path: '/', maxAge: 0 })
    }
  }

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`
    url.pathname = '/login'
    url.search = ''
    if (nextPath && nextPath !== '/hub') {
      url.searchParams.set('next', nextPath)
    }

    // Create redirect response while transferring any refreshed cookies
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  // If user is already logged in and visits /login, send them to next or /hub
  if (user && request.nextUrl.pathname === '/login') {
    const nextParam = request.nextUrl.searchParams.get('next')
    const targetPath =
      nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/hub'
    return NextResponse.redirect(new URL(targetPath, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}