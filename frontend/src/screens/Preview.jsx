import { C, Card, Btn, StepBar, Badge, LCDNumber, Divider } from '../components/ui'
import { startPayment } from '../lib/api'
import { useState } from 'react'

export default function Preview({ preview, analysisId, token, onPaid, onBack }) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const isOver = preview.meterStatus === 'overbilled'
  const isOk   = preview.meterStatus === 'ok'

  const handlePay = async () => {
    setLoading(true)
    setError(null)
    try {
      const { initPoint } = await startPayment(analysisId, token)
      // Redirige a Mercado Pago — al volver, la URL tiene ?pago=ok
      window.location.href = initPoint
    } catch (e) {
      setError('No se pudo iniciar el pago. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 480, margin: '0 auto' }}>
      <StepBar current={2} />

      <div style={{ marginBottom: 22 }}>
        <Badge
          color={isOk ? C.green : C.red}
          bg={isOk ? C.greenBg : C.redBg}
        >
          {isOk ? '✓ Todo cuadra' : '⚠️ Diferencia detectada'}
        </Badge>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', margin: '10px 0 4px' }}>
          Resultado del análisis
        </h2>
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
          {preview.periodStart} → {preview.periodEnd} · {preview.billsCount} boletas
        </p>
      </div>

      {/* Cuadratura principal */}
      <Card accent={isOk ? C.green : C.red} style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
          Cuadratura
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Boletas facturaron</div>
            <LCDNumber value={preview.totalKwhBilled} unit="kWh" size="sm" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Tu medidor marca</div>
            <LCDNumber value={preview.meterReading} unit="kWh" size="sm" color={C.text} />
          </div>
        </div>
        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Diferencia</div>
            <LCDNumber
              value={Math.abs(preview.differenceKwh)}
              unit="kWh"
              size="sm"
              color={isOk ? C.green : C.red}
            />
          </div>
          {!isOk && preview.differenceCLP > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Estimado en pesos</div>
              <LCDNumber
                value={`$${preview.differenceCLP.toLocaleString('es-CL')}`}
                size="sm"
                color={C.red}
              />
            </div>
          )}
        </div>

        {isOk && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: C.greenBg, borderRadius: 8, fontSize: 12, color: C.green }}>
            ✓ Tus boletas cuadran exactamente con la lectura del medidor. No hay cobros en exceso.
          </div>
        )}
      </Card>

      {/* Hallazgos — bloqueados si no está pagado */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Hallazgos detectados</div>
          <Badge color={C.amber} bg={C.amberBg}>{preview.findingsCount}</Badge>
        </div>

        {[
          {
            icon: isOk ? '✓' : '⚠️',
            text: isOk
              ? 'Cuadratura perfecta entre boletas y medidor'
              : `Diferencia de ${Math.abs(preview.differenceKwh)} kWh entre boletas y medidor`,
            locked: false,
          },
          { icon: '📈', text: 'Meses con consumo anómalo (picos estadísticos)', locked: true },
          { icon: '📋', text: 'Desglose mes a mes con análisis completo', locked: true },
        ].map((h, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '9px 0',
            borderBottom: i < 2 ? `1px solid ${C.border}` : 'none',
            opacity: h.locked ? 0.45 : 1,
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{h.locked ? '🔒' : h.icon}</span>
            <span style={{ fontSize: 12, color: h.locked ? C.muted : C.text, lineHeight: 1.5 }}>{h.text}</span>
          </div>
        ))}

        {preview.missingMonths > 0 && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: C.amberBg, borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: C.amber, fontWeight: 700, marginBottom: 4 }}>
              {preview.missingMonths} mes{preview.missingMonths > 1 ? 'es' : ''} sin boleta
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Para un análisis completo, sube las boletas faltantes.
            </div>
          </div>
        )}
      </Card>

      {/* CTA pago */}
      {error && (
        <div style={{ background: C.redBg, border: `1px solid ${C.red}44`, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: C.red, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <Card accent={C.amber} style={{ textAlign: 'center', marginBottom: 20, padding: '20px' }}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>Reporte completo</div>
        <LCDNumber value="$2.990" size="lg" />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4, marginBottom: 16 }}>
          CLP · pago único · incluye descarga PDF
        </div>
        <Btn fullWidth onClick={handlePay} disabled={loading}>
          {loading ? 'Redirigiendo a pago...' : 'Ver reporte completo →'}
        </Btn>
      </Card>

      <Btn variant="ghost" fullWidth onClick={onBack} small>
        ← Volver y agregar boletas
      </Btn>
    </div>
  )
}
