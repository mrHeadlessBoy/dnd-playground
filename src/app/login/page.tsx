'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [errorMsg, setErrorMsg] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('reason') === 'session-expired') {
        return 'Your session has timed out (6-hour limit). Please log in again.'
      }
    }
    return ''
  })
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    // Create the client here (not during render) so Supabase's internal
    // Date.now() calls don't run while Next.js prerenders this page.
    const supabase = createClient()

    const params = new URLSearchParams(window.location.search)
    const nextParam = params.get('next')
    const targetPath =
      nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/hub'

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(targetPath)}`,
        },
      })
      if (error) setErrorMsg(error.message)
      else setErrorMsg('Check your email for the confirmation link.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setErrorMsg(error.message)
      } else {
        // Set 6-hour session start timestamp cookie (21600 seconds)
        document.cookie = `dnd_session_start=${Date.now()}; path=/; max-age=21600; SameSite=Lax`
        router.push(targetPath)
        router.refresh()
      }
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur-md">
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
          {isSignUp ? 'Create your Table Account' : 'Enter the Realm'}
        </h1>
        <p className="text-sm text-zinc-400 mb-6">
          {isSignUp ? 'Sign up to join and run campaigns' : 'Log in to continue your campaign adventure'}
        </p>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-950/40 border border-red-800 p-3 text-sm text-red-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Log In'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-zinc-500">
          <button
            onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(''); }}
            className="hover:text-amber-400 underline underline-offset-4 cursor-pointer"
          >
            {isSignUp ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  )
}