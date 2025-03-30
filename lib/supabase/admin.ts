import { createClient } from '@supabase/supabase-js'

// Note: Use environment variables for sensitive keys
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const createAdminClient = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase URL or Service Role Key for admin client. Check .env.local')
  }
  // Create a new client instance specifically for admin tasks
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
    // Optional: Add global fetch options if needed
    // global: {
    //   fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) // Example: disable caching for admin actions
    // }
  })
}
