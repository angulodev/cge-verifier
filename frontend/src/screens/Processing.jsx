import { useEffect, useState } from 'react'
import { createAndProcess } from '../lib/api'
import { C } from '../components/ui'

const STEPS = [
  'Leyendo boletas...',
  'Extrayendo kWh por mes...',
  'Calculando cuadratura...',
  'Detectando hallazgos...',
  'Listo.',
]

export default function Processing({ files, meterReading, token, onDone, onError }) {
  const [progress, setProgress] = useState(0)
  const [stepIdx,  setStepIdx]  = useState(0)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      // Animación de progreso mientras el Worker procesa
      const tick = setInterval(() => {
        setProgress(p => {
          const next = Math.min(p + 2, 85)
          setStepIdx(Math.min(Math.floor(next / 20), STEPS.length - 2))
          return next
        })
      }, 120)

      try {
        const result = await createAndProcess(files, meterReading, token)
        clearInterval(tick)
        if (cancelled) return
        setProgress(100)
        setStepIdx(STEPS.length - 1)
        setTimeout(() => onDone(result), 500)
      } catch (e) {
        clearInterval(tick)
        if (!cancelled) onError(e.message)
      }
    }

    run()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 24px' }}>
      <div style={{ textAlign: 'center', width: '100%', maxWidth: 320 }}>
        <div style={{ fontSize: 40, marginBottom: 24 }}>⚡</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>Analizando</h2>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 32, minHeight: 20 }}>
          {STEPS[stepIdx]}
        </div>
        <div style={{ height: 4, background: C.border, borderRadius: 2, marginBottom: 32, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: C.amber, borderRadius: 2, width: `${progress}%`, transition: 'width 0.15s' }} />
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.muted }}>{progress}%</div>
      </div>
    </div>
  )
}
