import { useState, useEffect } from 'react'
import { supabase, logout } from './lib/supabase'
import { getPreview, getReport } from './lib/api'
import { C } from './components/ui'

import Landing    from './screens/Landing'
import Login      from './screens/Login'
import Upload     from './screens/Upload'
import Meter      from './screens/Meter'
import Processing from './screens/Processing'
import Preview    from './screens/Preview'
import Report     from './screens/Report'

function ErrorScreen({ message, onRetry }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 20 }}>⚠️</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10 }}>Algo salió mal</div>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 28, lineHeight: 1.6, maxWidth: 300 }}>{message}</div>
      <button onClick={onRetry} style={{ background: C.amber, color: '#080F1E', border: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
        Intentar de nuevo
      </button>
    </div>
  )
}

function Loader({ text = 'Cargando...' }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>⚡</div>
        <div style={{ color: C.muted, fontSize: 14 }}>{text}</div>
      </div>
    </div>
  )
}

export default function App() {
  const [screen,       setScreen]      = useState('landing')
  const [user,         setUser]        = useState(null)
  const [token,        setToken]       = useState(null)
  const [files,        setFiles]       = useState([])
  const [meterReading, setMeterReading]= useState(null)
  const [analysisId,   setAnalysisId]  = useState(null)
  const [preview,      setPreview]     = useState(null)
  const [report,       setReport]      = useState(null)
  const [error,        setError]       = useState(null)

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) { setUser(data.session.user); setToken(data.session.access_token) }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) {
        setUser(session.user); setToken(session.access_token)
        if (['landing', 'login'].includes(screen)) setScreen('upload')
      } else { setUser(null); setToken(null) }
    })

    // Retorno desde Mercado Pago
    const params = new URLSearchParams(window.location.search)
    if (params.get('pago') === 'ok') {
      const aid = params.get('analysis_id') ?? localStorage.getItem('cge_last_analysis')
      if (aid) { setAnalysisId(aid); setScreen('loading_report') }
      window.history.replaceState({}, '', '/')
    }

    return () => subscription.unsubscribe()
  }, [])

  // ── Cargar reporte tras pago ──────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'loading_report' || !analysisId || !token) return
    ;(async () => {
      try {
        const [p, r] = await Promise.all([getPreview(analysisId, token), getReport(analysisId, token)])
        setPreview(p.preview); setReport(r); setScreen('report')
      } catch (e) { setError(e.message); setScreen('error') }
    })()
  }, [screen, analysisId, token])

  const reset = () => {
    setScreen('landing'); setFiles([]); setMeterReading(null)
    setAnalysisId(null); setPreview(null); setReport(null); setError(null)
    localStorage.removeItem('cge_last_analysis')
  }

  // ── Handlers de flujo ─────────────────────────────────────────────────────
  const handleUploadNext = (selectedFiles) => {
    setFiles(selectedFiles)
    setScreen('meter')
  }

  const handleMeterNext = (reading) => {
    setMeterReading(reading)
    setScreen('processing')
  }

  const handleProcessingDone = (result) => {
    // result contiene { analysisId, preview }
    setAnalysisId(result.analysisId)
    setPreview(result.preview)
    localStorage.setItem('cge_last_analysis', result.analysisId)
    setScreen('preview')
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui,-apple-system,sans-serif', WebkitFontSmoothing: 'antialiased' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}input[type=number]{-moz-appearance:textfield}`}</style>

      {/* Header */}
      {screen !== 'landing' && (
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.bg + 'ee', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}`, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: 14, color: C.text }}>AuditaCGE</span>
          </div>
          {user && <button onClick={() => { logout(); reset() }} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12 }}>Salir</button>}
        </div>
      )}

      {screen === 'landing'        && <Landing    onStart={() => user ? setScreen('upload') : setScreen('login')} />}
      {screen === 'login'          && <Login />}
      {screen === 'upload'         && <Upload     onNext={handleUploadNext} />}
      {screen === 'meter'          && <Meter      onNext={handleMeterNext} />}
      {screen === 'processing'     && <Processing files={files} meterReading={meterReading} token={token} onDone={handleProcessingDone} onError={msg => { setError(msg); setScreen('error') }} />}
      {screen === 'preview'        && preview && <Preview preview={preview} analysisId={analysisId} token={token} onPaid={r => { setReport(r); setScreen('report') }} onBack={() => setScreen('upload')} />}
      {screen === 'loading_report' && <Loader text="Cargando reporte..." />}
      {screen === 'report'         && report && preview && <Report report={report} preview={preview} analysisId={analysisId} onHome={reset} />}
      {screen === 'error'          && <ErrorScreen message={error} onRetry={reset} />}
    </div>
  )
}
