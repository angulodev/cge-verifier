import { useEffect, useState } from 'react'
import { parseCGEBillBrowser } from '../lib/parser'
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
  const [detail,   setDetail]   = useState('')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        // 1. Parsear cada PDF en el browser
        const total   = files.length
        const parsed  = []

        for (let i = 0; i < files.length; i++) {
          if (cancelled) return
          const pct = Math.round(((i + 0.5) / total) * 60) // hasta 60%
          setProgress(pct)
          setStepIdx(0)
          setDetail(`${files[i].name}`)

          const result = await parseCGEBillBrowser(files[i])
          parsed.push(result)
        }

        const valid = parsed.filter(b => b.success)
        const failed = parsed.filter(b => !b.success)

        if (valid.length === 0) {
          onError(`No se pudo leer ninguna boleta. ${failed[0]?.error ?? ''}`)
          return
        }

        // 2. Enviar datos al Worker
        setProgress(70)
        setStepIdx(2)
        setDetail(`Enviando ${valid.length} boleta(s)...`)

        const result = await createAndProcess(valid, meterReading, token)

        setProgress(90)
        setStepIdx(3)
        setDetail('Analizando hallazgos...')

        await new Promise(r => setTimeout(r, 400))

        setProgress(100)
        setStepIdx(4)
        setDetail('')

        setTimeout(() => { if (!cancelled) onDone(result) }, 500)
      } catch (e) {
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
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 4, minHeight: 20 }}>
          {STEPS[stepIdx]}
        </div>
        {detail && (
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 24, minHeight: 16, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
            {detail}
          </div>
        )}
        <div style={{ height: 4, background: C.border, borderRadius: 2, marginBottom: 32, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: C.amber, borderRadius: 2, width: `${progress}%`, transition: 'width 0.2s' }} />
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.muted }}>{progress}%</div>
      </div>
    </div>
  )
}
