'use client' // Client component for form interaction

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message)
      } else {
        // Redirect on success - middleware should handle route protection,
        // but explicit redirect is good UX.
        // Check for redirect query param or default to dashboard
        const searchParams = new URLSearchParams(window.location.search)
        const redirectedFrom = searchParams.get('redirectedFrom') || '/dashboard'
        router.push(redirectedFrom)
        router.refresh() // Ensure server components reload with new session
      }
    } catch (catchError: any) {
      setError('An unexpected error occurred. Please try again.')
      console.error("Login Error:", catchError)
    } finally {
      setLoading(false)
    }
  }

  // TODO: Add Sign Up link/functionality
  // TODO: Add OAuth login buttons (e.g., Google, GitHub)

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Log In</h1>
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring focus:ring-blue-200"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring focus:ring-blue-200"
            />
          </div>
          {error && <p className="mb-4 text-center text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        {/* Placeholder for Sign Up link */}
        <p className="mt-4 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          {/* <Link href="/signup" className="text-blue-600 hover:underline">Sign Up</Link> */}
          <span className="text-gray-400">(Sign Up not implemented)</span>
        </p>
        {/* Placeholder for OAuth buttons */}
        <div className="mt-6 text-center">
           <p className="text-sm text-gray-400">(OAuth buttons not implemented)</p>
        </div>
      </div>
    </div>
  )
}
