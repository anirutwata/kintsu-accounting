import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS and column-level permissions
// Use only in server-side API routes, never in client components
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
