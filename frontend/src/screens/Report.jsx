import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { C, Card, Btn, StepBar, Badge, LCDNumber, Divider } from '../components/ui'

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function monthLabel(bill) {
  // bill.period viene como "MM/YYYY"
  const [m, y] = bill.period.split('/')
  return `${MONTHS_ES[parseInt(m) - 1]} ${y.slice(2)}`
}

function formatCLP(n) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

export default function Report({ report, preview, analysisId, onHome }) {
  const [tab, setTab] = useState('consumo')

  const bills    = report.bills ?? []
  const findings = report.findings ?? []
  const avgKwh   = report.avgMonthlyKwh ?? 0

  const chartData = bills.map(b => ({
    name:   monthLabel(b),
    kwh:    b.kwhConsumed,
    amount: b.totalAmount,
    spike:  b.isSpike,
  }))

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ fontWeight: 700, color: C.text, fontSize: 13, marginBottom: 4 }}>{label}</div>
        <div style={{ color: d.spike ? C.red : C.amber, fontSize: 14, fontFamily: 'monospace', fontWeight: 700 }}>
          {d.kwh} kWh
        </div>
        <div style={{ color: C.muted, fontSize: 12 }}>{formatCLP(d.amount)}</div>
        {d.spike && <div style={{ color: C.red, fontSize: 11, marginTop: 4 }}>⚠️ Pico detectado</div>}
      </div>
    )
  }

  const severityColor = { critical: C.red, warning: C.amber, info: C.muted }
  const severityBg    = { critical: C.redBg, warning: C.amberBg, info: 'rgba(107,143,173,0.12)' }
  const severityLabel = { critical: 'CRÍTICO', warning: 'WARNING', info: 'INFO' }

  return (
    <div style={{ padding: '24px 24px 60px', maxWidth: 480, margin: '0 auto' }}>
      <StepBar current={3} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <Badge color={C.green} bg={C.greenBg}>✓ Reporte completo</Badge>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', margin: '8px 0 4px' }}>
            Auditoría CGE
          </h2>
          <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>
            {preview.periodStart} → {preview.periodEnd} · {preview.billsCount} boletas
          </p>
        </div>
        <a
          href={`${import.meta.env.VITE_WORKER_URL}/api/analyses/${analysisId}/pdf`}
          target="_blank"
          rel="noreferrer"
          style={{
            background: C.surf, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
            color: C.muted, fontSize: 12, fontWeight: 700,
            textDecoration: 'none', display: 'inline-block',
          }}
        >
          ↓ PDF
        </a>
      </div>

      {/* Stats rápidos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total facturado', val: preview.totalKwhBilled, unit: 'kWh', color: C.amber },
          { label: 'Medidor marca',   val: preview.meterReading,   unit: 'kWh', color: C.text },
          { label: 'Diferencia',      val: Math.abs(preview.differenceKwh), unit: 'kWh', color: C.red },
          { label: 'En pesos (~)',    val: `$${preview.differenceCLP?.toLocaleString('es-CL') ?? '0'}`, color: C.red },
        ].map((s, i) => (
          <Card key={i} style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              {s.label}
            </div>
            <LCDNumber value={s.val} unit={s.unit} size="sm" color={s.color} />
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        {[
          { id: 'consumo',   label: 'Consumo' },
          { id: 'detalle',   label: 'Detalle' },
          { id: 'hallazgos', label: 'Hallazgos' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
            color: tab === t.id ? C.amber : C.muted,
            padding: '8px 16px 10px',
            borderBottom: `2px solid ${tab === t.id ? C.amber : 'transparent'}`,
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Consumo ─────────────────────────────────── */}
      {tab === 'consumo' && (
        <div>
          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
              kWh por mes
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={chartData} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <ReferenceLine y={avgKwh} stroke={C.muted} strokeDasharray="3 3" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="kwh" radius={[4, 4, 0, 0]}>
                  {chartData.map((b, i) => (
                    <Cell key={i} fill={b.spike ? C.red : C.amber} opacity={b.spike ? 1 : 0.78} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'center' }}>
              {[
                { color: C.amber, label: 'Normal' },
                { color: C.red,   label: 'Pico detectado' },
              ].map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block' }} />
                  {l.label}
                </div>
              ))}
            </div>
          </Card>

          {/* Stats del período */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Promedio',    val: avgKwh,              sub: 'kWh/mes' },
              { label: 'Mes máximo',  val: report.maxKwhMonth?.kwhConsumed ?? '—', sub: monthLabel(report.maxKwhMonth ?? { period: '01/2000' }) },
              { label: 'Mes mínimo',  val: report.minKwhMonth?.kwhConsumed ?? '—', sub: monthLabel(report.minKwhMonth ?? { period: '01/2000' }) },
            ].map((s, i) => (
              <Card key={i} style={{ padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 800, color: C.text, fontSize: 17 }}>{s.val}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{s.sub}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Detalle ─────────────────────────────────── */}
      {tab === 'detalle' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {bills.map((b, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 16px',
              borderBottom: i < bills.length - 1 ? `1px solid ${C.border}` : 'none',
              background: b.isSpike ? C.redBg : 'transparent',
            }}>
              <div style={{ minWidth: 52 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: b.isSpike ? C.red : C.text }}>
                  {monthLabel(b)}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: b.isSpike ? C.red : C.amber, fontSize: 15 }}>
                  {b.kwhConsumed} kWh
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: C.muted }}>{formatCLP(b.totalAmount)}</div>
                {b.isSpike && <div style={{ fontSize: 10, color: C.red }}>⚠️ pico</div>}
                {b.hasArithmeticIssue && <div style={{ fontSize: 10, color: C.amber }}>⚠️ error aritmético</div>}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* ── Tab: Hallazgos ───────────────────────────────── */}
      {tab === 'hallazgos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {findings.length === 0 && (
            <Card>
              <div style={{ textAlign: 'center', color: C.muted, fontSize: 14, padding: '20px 0' }}>
                No se detectaron hallazgos adicionales.
              </div>
            </Card>
          )}
          {findings.map((f, i) => {
            const color = severityColor[f.severity] ?? C.muted
            const bg    = severityBg[f.severity]   ?? 'transparent'
            const label = severityLabel[f.severity] ?? f.severity
            return (
              <Card key={i} accent={color}>
                <Badge color={color} bg={bg}>{label}</Badge>
                <div style={{ fontWeight: 700, color: C.text, margin: '8px 0 6px', fontSize: 14 }}>
                  {f.type === 'meter_mismatch'     && 'Descuadre con medidor'}
                  {f.type === 'consumption_spike'  && 'Pico de consumo anómalo'}
                  {f.type === 'billing_arithmetic' && 'Error aritmético en boleta'}
                  {f.type === 'missing_months'     && 'Meses sin boleta'}
                </div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                  {f.description}
                </div>
                {f.amountAffected > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color, fontWeight: 700 }}>
                    Impacto estimado: {formatCLP(f.amountAffected)} CLP
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 28 }}>
        <Btn variant="ghost" fullWidth onClick={onHome} small>
          ← Volver al inicio
        </Btn>
      </div>
    </div>
  )
}
