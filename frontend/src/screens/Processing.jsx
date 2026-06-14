import { useEffect, useState } from 'react'
import { processAnalysis } from '../lib/api'
import { C } from '../components/ui'

const STEPS = [
  'Leyendo boletas...',
  'Extrayendo kWh por mes...',
  'Calculando cuadratura...',
  'Detectando hallazgos...',
  'Listo.',
]

export default function Processing({ analysisId, bills, token, onDone, onError }) {
  const [progress, setProgress] = useState(0)
  const [stepIdx, setStepIdx]   = useState(0)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      // Barra de progreso animada mientras el Worker trabaja
      const tick = setInterval(() => {
        setProgress(p => {
          const next = Math.min(p + 2, 85) // llega hasta 85% — el 100% lo cierra la respuesta real
          setStepIdx(Math.min(Math.floor(next / 20), STEPS.length - 2))
          return next
        })
      }, 120)

      try {
        const result = await processAnalysis(
          analysisId,
          bills.map(b => ({ r2Key: b.r2Key, fileName: b.name })),
          token
        )

        clearInterval(tick)
        if (cancelled) return

        setProgress(100)
        setStepIdx(STEPS.length - 1)
        setTimeout(() => onDone(result), 600)
      } catch (e) {
        clearInterval(tick)
        if (!cancelled) onError(e.message)
      }
    }

    run()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center', padding: '40px 24px',
    }}>
      <div style={{ textAlign: 'center', width: '100%', maxWidth: 320 }}>
        <div style={{ fontSize: 40, marginBottom: 24 }}>⚡</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>
          Analizando
        </h2>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 32, minHeight: 20 }}>
          {STEPS[stepIdx]}
        </div>

        <div style={{ height: 4, background: C.border, borderRadius: 2, marginBottom: 32, overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: C.amber, borderRadius: 2,
            width: `${progress}%`, transition: 'width 0.15s',
          }} />
        </div>

        <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.muted }}>
          {progress}%
        </div>
      </div>
    </div>
  )
}
