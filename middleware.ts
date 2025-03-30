import { type NextRequest, NextResponse } from 'next/server'
import { updateSession, createMiddlewareClient } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Update session cookies first
  const response = await updateSession(request)

  // Use the helper function to create a client for auth check
  const supabase = createMiddlewareClient(request, response)
  const { data: { user } } = await supabase.auth.getUser()

  // Define protected routes
  const protectedRoutes = ['/dashboard', '/account', '/api/chronam-proxy', '/api/checkout-sessions', '/api/portal-links'] // Added API routes

  // Redirect to login if not authenticated and accessing a protected route
  if (!user && protectedRoutes.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login' // Assuming '/login' is your login page route
    url.searchParams.set('redirectedFrom', request.nextUrl.pathname) // Optional: add redirect info
    return NextResponse.redirect(url)
  }

  // Allow the request to proceed
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/webhooks/stripe (Stripe webhook needs to be public)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks/stripe|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
