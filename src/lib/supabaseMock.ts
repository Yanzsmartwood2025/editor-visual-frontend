import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

// MOCK SIMPLE PARA DEV O CON FALLBACK DE VERIFICACIÓN LOCAL
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: { user: { email: 'dev@test.com'} } } }),
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: async () => ({ error: null })
  }
} as unknown as ReturnType<typeof createClient>;