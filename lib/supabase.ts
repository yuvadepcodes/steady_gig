import { createClient, SupabaseClient } from '@supabase/supabase-js';

function cleanEnv(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/^['"]|['"]$/g, '') : undefined;
}

function normalizeSupabaseUrl(value?: string): string | undefined {
  const cleaned = cleanEnv(value);
  if (!cleaned) return undefined;
  try {
    const parsed = new URL(cleaned);
    // Supabase JS SDK appends /rest/v1, /auth/v1, /realtime/v1 automatically;
    // strip accidental paths like /rest/v1 from the base URL.
    if (parsed.pathname && parsed.pathname !== '/') {
      return parsed.origin;
    }
    return cleaned.replace(/\/+$/, '');
  } catch {
    return cleaned;
  }
}

const supabaseUrl = normalizeSupabaseUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
);
const supabaseKey = cleanEnv(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[SteadyGig] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

// Client-safe default Supabase instance
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Server-side privileged Supabase client (prefers SERVICE_ROLE_KEY for serverless mutations)
export function getSupabaseServerClient(): SupabaseClient | null {
  const url = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  );
  const key = cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY
  );

  if (!url || !key) {
    return supabase;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
