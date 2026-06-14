import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Devuelve el token JWT del usuario activo
export async function getToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
}

// Login con Google
export function loginWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
}

export function logout() {
  return supabase.auth.signOut()
}
