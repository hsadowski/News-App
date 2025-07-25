import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Define variable to satisfy Next's stricter linting rules
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
