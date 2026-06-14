import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'

const app = new Hono()

app.use('*', cors({ origin: '*' }))

app.use('*', async (c, next) => {
  const auth = c.req.header('Authorization')
  c.set('supabase', createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY,
    auth ? { global: { headers: { Authorization: auth } } } : {}
  ))
  await next()
})

app.get('/health', c => c.json({ ok: true, module: 'cge-verifier' }))

// ── POST /api/analyses ─────────────────────────────────────────────────────
// Recibe datos ya parseados desde el browser (no PDFs)
app.post('/api/analyses', async c => {
  const supabase = c.get('supabase')
  const { meter_reading, bills: parsedBills } = await c.req.json()

  if (!meter_reading || !parsedBills?.length) {
    return c.json({ error: 'meter_reading y bills son requeridos' }, 400)
  }

  // 1. Crear análisis
  const { data: analysis, error: aErr } = await supabase
    .from('cge_analyses')
    .insert({ meter_reading, status: 'processing' })
    .select().single()

  if (aErr) return c.json({ error: aErr.message }, 500)

  const findings = []

  // 2. Guardar boletas en Supabase
  for (const b of parsedBills.filter(b => b.success)) {
    const { data: bill } = await supabase.from('cge_bills').insert({
      analysis_id:          analysis.id,
      bill_number:          b.billNumber,
      client_number:        b.clientNumber,
      client_address:       b.clientAddress,
      emission_date:        b.emissionDate,
      period_month:         b.periodMonth,
      period_year:          b.periodYear,
      kwh_consumed:         b.kwhConsumed,
      total_boleta:         b.totalBoleta,
      total_ajustes:        b.totalAjustes,
      total_amount:         b.totalAmount,
      price_per_kwh:        b.pricePerKwh,
      charges:              b.charges,
      file_name:            b.fileName,
      has_arithmetic_issue: b.hasArithmeticIssue,
    }).select().single()

    if (b.hasArithmeticIssue) {
      findings.push({
        analysis_id: analysis.id, bill_id: bill?.id,
        type: 'billing_arithmetic', severity: 'critical',
        description: `Boleta ${b.billNumber}: los cargos no cuadran con el total`,
        is_preview: false,
      })
    }
  }

  // 3. Calcular cuadratura
  const sorted = parsedBills
    .filter(b => b.success)
    .sort((a, b) => a.periodYear !== b.periodYear ? a.periodYear - b.periodYear : a.periodMonth - b.periodMonth)

  const totalKwh   = sorted.reduce((s, b) => s + b.kwhConsumed, 0)
  const diffKwh    = meter_reading - totalKwh
  const avgPrice   = sorted.filter(b => b.pricePerKwh).reduce((s, b, _, arr) => s + b.pricePerKwh / arr.length, 0)
  const diffCLP    = Math.round(Math.abs(diffKwh) * avgPrice)
  const status     = Math.abs(diffKwh) <= 2 ? 'ok' : diffKwh < 0 ? 'overbilled' : 'underbilled'

  // 4. Detectar meses faltantes
  const missing = []
  for (let i = 0; i < sorted.length - 1; i++) {
    let em = sorted[i].periodMonth + 1, ey = sorted[i].periodYear
    if (em > 12) { em = 1; ey++ }
    if (sorted[i+1].periodMonth !== em || sorted[i+1].periodYear !== ey) {
      let m = em, y = ey
      while (!(m === sorted[i+1].periodMonth && y === sorted[i+1].periodYear)) {
        missing.push({ month: m, year: y, label: `${String(m).padStart(2,'0')}/${y}` })
        m++; if (m > 12) { m = 1; y++ }
      }
    }
  }

  // 5. Detectar picos
  const vals   = sorted.map(b => b.kwhConsumed)
  const mean   = vals.reduce((a, b) => a + b, 0) / vals.length
  const stdDev = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length)
  for (const b of sorted) {
    if (b.kwhConsumed > mean + 1.5 * stdDev) {
      findings.push({
        analysis_id: analysis.id,
        type: 'consumption_spike', severity: 'warning',
        description: `${String(b.periodMonth).padStart(2,'0')}/${b.periodYear}: consumo ${Math.round(((b.kwhConsumed - mean) / mean) * 100)}% sobre el promedio`,
        amount_affected: Math.round((b.kwhConsumed - mean) * avgPrice),
        is_preview: false,
        metadata: { kwhConsumed: b.kwhConsumed, avgKwh: Math.round(mean) },
      })
    }
  }

  if (status !== 'ok') {
    findings.push({
      analysis_id: analysis.id, type: 'meter_mismatch', severity: 'critical',
      description: status === 'overbilled'
        ? `Te cobraron ${Math.abs(Math.round(diffKwh))} kWh de más (~$${diffCLP.toLocaleString('es-CL')} CLP)`
        : `Hay ${Math.round(diffKwh)} kWh consumidos sin facturar`,
      amount_affected: diffCLP, is_preview: true,
      metadata: { diffKwh: Math.round(diffKwh), status },
    })
  }

  if (missing.length) {
    findings.push({
      analysis_id: analysis.id, type: 'missing_months', severity: 'info',
      description: `Faltan ${missing.length} boleta(s): ${missing.map(m => m.label).join(', ')}`,
      is_preview: true, metadata: { missingMonths: missing },
    })
  }

  if (findings.length) await supabase.from('cge_findings').insert(findings)

  await supabase.from('cge_analyses').update({
    status: 'preview', total_kwh_billed: totalKwh,
    difference_kwh: Math.round(diffKwh), difference_clp: diffCLP,
    avg_price_per_kwh: Math.round(avgPrice), bills_count: sorted.length,
    period_start: sorted[0]?.emissionDate, period_end: sorted.at(-1)?.emissionDate,
    meter_status: status,
  }).eq('id', analysis.id)

  return c.json({
    analysisId: analysis.id,
    preview: {
      billsCount: sorted.length, totalKwhBilled: Math.round(totalKwh),
      meterReading: meter_reading, differenceKwh: Math.abs(Math.round(diffKwh)),
      differenceCLP: diffCLP, meterStatus: status,
      findingsCount: findings.length, missingMonths: missing.length,
      periodStart: sorted[0] ? `${sorted[0].periodMonth}/${sorted[0].periodYear}` : null,
      periodEnd:   sorted.at(-1) ? `${sorted.at(-1).periodMonth}/${sorted.at(-1).periodYear}` : null,
    }
  })
})

// ── GET /api/analyses/:id/preview ─────────────────────────────────────────
app.get('/api/analyses/:id/preview', async c => {
  const supabase = c.get('supabase')
  const { data } = await supabase.from('cge_analyses').select('*').eq('id', c.req.param('id')).single()
  if (!data) return c.json({ error: 'No encontrado' }, 404)
  const { data: findings } = await supabase.from('cge_findings').select('*').eq('analysis_id', data.id).eq('is_preview', true)
  return c.json({
    preview: {
      billsCount: data.bills_count, totalKwhBilled: data.total_kwh_billed,
      meterReading: data.meter_reading, differenceKwh: Math.abs(data.difference_kwh ?? 0),
      differenceCLP: data.difference_clp, meterStatus: data.meter_status,
      findingsCount: findings?.length ?? 0,
      missingMonths: findings?.find(f => f.type === 'missing_months')?.metadata?.missingMonths?.length ?? 0,
      periodStart: data.period_start, periodEnd: data.period_end,
    }
  })
})

// ── GET /api/analyses/:id/detail ──────────────────────────────────────────
app.get('/api/analyses/:id/detail', async c => {
  const supabase = c.get('supabase')
  const { data: analysis } = await supabase.from('cge_analyses').select('*').eq('id', c.req.param('id')).single()
  if (!analysis) return c.json({ error: 'No encontrado' }, 404)
  if (analysis.status !== 'paid') return c.json({ error: 'Pago requerido', code: 'PAYMENT_REQUIRED' }, 402)
  const [{ data: bills }, { data: findings }] = await Promise.all([
    supabase.from('cge_bills').select('*').eq('analysis_id', analysis.id).order('period_year').order('period_month'),
    supabase.from('cge_findings').select('*').eq('analysis_id', analysis.id),
  ])
  const kwhs = bills?.map(b => b.kwh_consumed) ?? []
  const avg  = kwhs.length ? Math.round(kwhs.reduce((a,b)=>a+b,0)/kwhs.length) : 0
  return c.json({
    analysis, findings,
    bills: bills?.map(b => ({
      period: `${String(b.period_month).padStart(2,'0')}/${b.period_year}`,
      emissionDate: b.emission_date, billNumber: b.bill_number,
      kwhConsumed: b.kwh_consumed, totalAmount: b.total_amount, pricePerKwh: b.price_per_kwh,
      isSpike: findings?.some(f => f.bill_id === b.id && f.type === 'consumption_spike') ?? false,
      hasArithmeticIssue: b.has_arithmetic_issue,
    })),
    avgMonthlyKwh: avg,
    maxKwhMonth: bills?.reduce((m,b) => b.kwh_consumed > (m?.kwh_consumed??0)?b:m, null),
    minKwhMonth: bills?.reduce((m,b) => b.kwh_consumed < (m?.kwh_consumed??Infinity)?b:m, null),
  })
})

// ── POST /api/analyses/:id/pay ─────────────────────────────────────────────
app.post('/api/analyses/:id/pay', async c => {
  const supabase = c.get('supabase')
  const id = c.req.param('id')
  const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.env.MP_ACCESS_TOKEN}` },
    body: JSON.stringify({
      items: [{ title: 'AuditaCGE — Reporte completo', quantity: 1, unit_price: 2990, currency_id: 'CLP' }],
      back_urls: { success: `${c.env.SITE_URL}/?pago=ok&analysis_id=${id}`, failure: `${c.env.SITE_URL}/?pago=error` },
      auto_return: 'approved',
      notification_url: `${c.env.WORKER_URL}/api/webhooks/mp`,
      metadata: { analysis_id: id },
    }),
  })
  const mp = await mpRes.json()
  if (!mp.id) return c.json({ error: 'Error MP' }, 500)
  await supabase.from('cge_payments').insert({ analysis_id: id, provider_order_id: mp.id, amount: 2990 })
  return c.json({ preferenceId: mp.id, initPoint: mp.init_point })
})

// ── POST /api/webhooks/mp ──────────────────────────────────────────────────
app.post('/api/webhooks/mp', async c => {
  const supabase = c.get('supabase')
  const body = await c.req.json()
  if (body.type !== 'payment') return c.json({ ok: true })
  const pay = await (await fetch(`https://api.mercadopago.com/v1/payments/${body.data.id}`, { headers: { 'Authorization': `Bearer ${c.env.MP_ACCESS_TOKEN}` } })).json()
  if (pay.status !== 'approved') return c.json({ ok: true })
  const aid = pay.metadata?.analysis_id
  if (!aid) return c.json({ ok: true })
  await supabase.from('cge_payments').update({ status: 'approved', provider_payment_id: String(pay.id), paid_at: new Date().toISOString() }).eq('analysis_id', aid).eq('status', 'pending')
  await supabase.from('cge_analyses').update({ status: 'paid' }).eq('id', aid)
  return c.json({ ok: true })
})

export default app
