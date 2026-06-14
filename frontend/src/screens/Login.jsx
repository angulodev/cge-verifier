import { useState } from 'react'
import { loginWithGoogle } from '../lib/supabase'
import { C, Btn } from '../components/ui'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      await loginWithGoogle()
      // Supabase redirige al proveedor — no hay nada más que hacer aquí
    } catch (e) {
      setError('No se pudo conectar con Google. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <span>⚡</span>
          <span style={{ fontWeight: 800, color: C.text }}>AuditaCGE</span>
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
          Crea tu cuenta
        </h2>
        <p style={{ color: C.muted, fontSize: 15, margin: 0, lineHeight: 1.6 }}>
          Para guardar el historial de tus análisis.
        </p>
      </div>

      {error && (
        <div style={{
          background: C.redBg, border: `1px solid ${C.red}44`,
          borderRadius: 10, padding: '12px 16px',
          fontSize: 13, color: C.red, marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      <Btn variant="google" fullWidth onClick={handleLogin} disabled={loading}>
        {loading ? (
          '...'
        ) : (
          <>
            <GoogleIcon />
            Continuar con Google
          </>
        )}
      </Btn>

      <p style={{ textAlign: 'center', fontSize: 12, color: C.muted, marginTop: 24, lineHeight: 1.7 }}>
        Tus PDFs se eliminan de nuestros servidores a los 90 días.<br />
        Los datos extraídos se conservan en tu historial.
      </p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
