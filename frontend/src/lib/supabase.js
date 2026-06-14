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
  // window.location.origin solo da el dominio, necesitamos incluir el base path
  const redirectTo = import.meta.env.VITE_SITE_URL
    ?? `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`

  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
}

export function logout() {
  return supabase.auth.signOut()
}
