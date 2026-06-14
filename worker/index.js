import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'
import pdfParse from 'pdf-parse'

const app = new Hono()

app.use('*', cors())

// ── Supabase client autenticado con el JWT del usuario ─────────────────────
app.use('*', async (c, next) => {
  const auth = c.req.header('Authorization')
  c.set('supabase', createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY,
    auth ? { global: { headers: { Authorization: auth } } } : {}
  ))
  await next()
})

// ── Patterns para parsear PDF CGE ──────────────────────────────────────────
const P = {
  clientNumber:   /N[ºo°]\s*Cliente:\s*(\d+)/i,
  clientAddress:  /Direcci[oó]n del Cliente:\s*(.+)/i,
  billNumber:     /Ref\.\s*Boleta\/Fatura\s*N[ºo°]:\s*(\d+)/i,
  emissionDate:   /Fecha\s*Emisi[oó]n\s*de\s*Facturaci[oó]n:\s*(\d{2}-\d{2}-\d{4})/i,
  kwhConsumed:    /Cargo\s+energ[ií]a\s*\((\d+(?:[.,]\d+)?)\s*kWh\)/i,
  totalBoleta:    /Total\s+Boleta:\s*\$?\s*([\d.]+)/i,
  totalPagar:     /TOTAL\s+A\s+PAGAR:\s*\$?\s*([\d.]+)/i,
  adminServicio:  /Administraci[oó]n del servicio\s*\$\s*([\d.]+)/i,
  transporte:     /Transporte de electricidad\s*\$\s*([\d.]+)/i,
  cargoPublico:   /Cargo servicio p[uú]blico\s*\$\s*([\d.]+)/i,
  cargoPotencia:  /Cargo compra potencia bt1[^$\n]*\$\s*([\d.]+)/i,
  cargoBase:      /Cargo pot\.base distribuci[oó]n[^$\n]*\$\s*([\d.]+)/i,
  cargoEnergia:   /Cargo energ[ií]a[^$\n]*\$\s*([\d.]+)/i,
  ajusteAnterior: /mes anterior\s*\$\s*([\d.]+)/i,
  ajusteActual:   /mes actual\s*\$\s*(-?[\d.]+)/i,
}

function ex(text, pat) {
  const m = text.match(pat)
  return m ? m[1].trim() : null
}

function clp(str) {
  if (!str) return null
  return parseFloat(str.replace(/\./g, ''))
}

async function parsePDF(buffer) {
  const { text } = await pdfParse(buffer)

  const kwhRaw     = ex(text, P.kwhConsumed)
  const kwhConsumed = kwhRaw ? parseInt(kwhRaw) : null
  const rawDate    = ex(text, P.emissionDate)
  let emissionDate = null
  if (rawDate) {
    const [dd, mm, yyyy] = rawDate.split('-')
    emissionDate = `${yyyy}-${mm}-${dd}`
  }

  // Período: mes anterior a la emisión
  let periodMonth = null, periodYear = null
  if (emissionDate) {
    const [yyyy, mm] = emissionDate.split('-')
    periodMonth = parseInt(mm) - 1 || 12
    periodYear  = parseInt(mm) === 1 ? parseInt(yyyy) - 1 : parseInt(yyyy)
  }

  const charges = {
    adminServicio:  clp(ex(text, P.adminServicio)),
    transporte:     clp(ex(text, P.transporte)),
    cargoPublico:   clp(ex(text, P.cargoPublico)),
    cargoPotencia:  clp(ex(text, P.cargoPotencia)),
    cargoBase:      clp(ex(text, P.cargoBase)),
    cargoEnergia:   clp(ex(text, P.cargoEnergia)),
    ajusteAnterior: clp(ex(text, P.ajusteAnterior)),
    ajusteActual:   clp(ex(text, P.ajusteActual)),
  }

  const totalBoleta = clp(ex(text, P.totalBoleta))
  const totalAmount = clp(ex(text, P.totalPagar))

  // Validación aritmética: servicios eléctricos deben cuadrar con Total Boleta
  const sumServicios = [
    charges.adminServicio, charges.transporte, charges.cargoPublico,
    charges.cargoPotencia, charges.cargoBase, charges.cargoEnergia,
  ].filter(Boolean).reduce((a, b) => a + b, 0)

  const hasArithmeticIssue = totalBoleta && Math.abs(sumServicios - totalBoleta) > 5

  return {
    success: !!kwhConsumed,
    clientNumber:  ex(text, P.clientNumber),
    clientAddress: ex(text, P.clientAddress),
    billNumber:    ex(text, P.billNumber),
    emissionDate,
    periodMonth,
    periodYear,
    kwhConsumed,
    totalBoleta,
    totalAjustes:  (charges.ajusteAnterior ?? 0) + (charges.ajusteActual ?? 0),
    totalAmount,
    pricePerKwh:   kwhConsumed && totalBoleta ? Math.round(totalBoleta / kwhConsumed) : null,
    charges,
    hasArithmeticIssue,
  }
}

// ── GET /health ────────────────────────────────────────────────────────────
app.get('/health', c => c.json({ ok: true, module: 'cge-verifier' }))

// ── POST /api/analyses ─────────────────────────────────────────────────────
// Crea análisis y procesa los PDFs en una sola llamada
app.post('/api/analyses', async c => {
  const supabase = c.get('supabase')

  const form = await c.req.formData()
  const meterReading = parseFloat(form.get('meter_reading'))
  const files = form.getAll('bills') // array de File

  if (!meterReading || isNaN(meterReading)) {
    return c.json({ error: 'meter_reading requerido' }, 400)
  }
  if (!files.length) {
    return c.json({ error: 'Debes subir al menos una boleta' }, 400)
  }

  // 1. Crear el análisis
  const { data: analysis, error: aErr } = await supabase
    .schema('cge').from('analyses')
    .insert({ meter_reading: meterReading, status: 'processing' })
    .select().single()

  if (aErr) return c.json({ error: aErr.message }, 500)

  // 2. Parsear cada PDF en memoria y guardar datos en Supabase
  const parsedBills = []
  const findings    = []

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await parsePDF(buffer)

    if (!parsed.success) continue

    const { data: bill } = await supabase.schema('cge').from('bills').insert({
      analysis_id:          analysis.id,
      bill_number:          parsed.billNumber,
      client_number:        parsed.clientNumber,
      client_address:       parsed.clientAddress,
      emission_date:        parsed.emissionDate,
      period_month:         parsed.periodMonth,
      period_year:          parsed.periodYear,
      kwh_consumed:         parsed.kwhConsumed,
      total_boleta:         parsed.totalBoleta,
      total_ajustes:        parsed.totalAjustes,
      total_amount:         parsed.totalAmount,
      price_per_kwh:        parsed.pricePerKwh,
      charges:              parsed.charges,
      file_name:            file.name,
      has_arithmetic_issue: parsed.hasArithmeticIssue,
    }).select().single()

    parsedBills.push({ ...parsed, dbId: bill?.id })

    if (parsed.hasArithmeticIssue) {
      findings.push({
        analysis_id:    analysis.id,
        bill_id:        bill?.id,
        type:           'billing_arithmetic',
        severity:       'critical',
        description:    `Boleta ${parsed.billNumber}: los cargos no cuadran con el total declarado`,
        is_preview:     false,
      })
    }
  }

  if (!parsedBills.length) {
    await supabase.schema('cge').from('analyses').update({ status: 'error' }).eq('id', analysis.id)
    return c.json({ error: 'No se pudo leer ninguna boleta' }, 422)
  }

  // 3. Calcular cuadratura
  const sorted = parsedBills
    .filter(b => b.success)
    .sort((a, b) => a.periodYear !== b.periodYear
      ? a.periodYear - b.periodYear
      : a.periodMonth - b.periodMonth)

  const totalKwhBilled = sorted.reduce((s, b) => s + b.kwhConsumed, 0)
  const differenceKwh  = meterReading - totalKwhBilled
  const avgPrice       = sorted.filter(b => b.pricePerKwh).reduce((s, b) => s + b.pricePerKwh, 0) / sorted.filter(b => b.pricePerKwh).length
  const differenceCLP  = Math.round(Math.abs(differenceKwh) * avgPrice)

  const meterStatus = Math.abs(differenceKwh) <= 2 ? 'ok'
    : differenceKwh < 0 ? 'overbilled' : 'underbilled'

  // 4. Detectar meses faltantes
  const missingMonths = []
  for (let i = 0; i < sorted.length - 1; i++) {
    let em = sorted[i].periodMonth + 1, ey = sorted[i].periodYear
    if (em > 12) { em = 1; ey++ }
    if (sorted[i + 1].periodMonth !== em || sorted[i + 1].periodYear !== ey) {
      let m = em, y = ey
      while (!(m === sorted[i + 1].periodMonth && y === sorted[i + 1].periodYear)) {
        missingMonths.push({ month: m, year: y, label: `${String(m).padStart(2,'0')}/${y}` })
        m++; if (m > 12) { m = 1; y++ }
      }
    }
  }

  // 5. Detectar picos de consumo
  const vals    = sorted.map(b => b.kwhConsumed)
  const mean    = vals.reduce((a, b) => a + b, 0) / vals.length
  const stdDev  = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length)
  const threshold = mean + 1.5 * stdDev

  for (const b of sorted) {
    if (b.kwhConsumed > threshold) {
      findings.push({
        analysis_id:    analysis.id,
        bill_id:        b.dbId,
        type:           'consumption_spike',
        severity:       'warning',
        description:    `${String(b.periodMonth).padStart(2,'0')}/${b.periodYear}: consumo ${Math.round(((b.kwhConsumed - mean) / mean) * 100)}% sobre el promedio`,
        amount_affected: Math.round((b.kwhConsumed - mean) * avgPrice),
        is_preview:     false,
        metadata:       { kwhConsumed: b.kwhConsumed, avgKwh: Math.round(mean) },
      })
    }
  }

  // Hallazgo principal de cuadratura (visible en preview)
  if (meterStatus !== 'ok') {
    findings.push({
      analysis_id:    analysis.id,
      type:           'meter_mismatch',
      severity:       'critical',
      description:    meterStatus === 'overbilled'
        ? `Te cobraron ${Math.abs(Math.round(differenceKwh))} kWh de más (~$${differenceCLP.toLocaleString('es-CL')} CLP)`
        : `Hay ${Math.round(differenceKwh)} kWh consumidos sin facturar`,
      amount_affected: differenceCLP,
      is_preview:     true,
      metadata:       { differenceKwh: Math.round(differenceKwh), meterStatus },
    })
  }

  if (missingMonths.length) {
    findings.push({
      analysis_id: analysis.id,
      type:        'missing_months',
      severity:    'info',
      description: `Faltan ${missingMonths.length} boleta(s): ${missingMonths.map(m => m.label).join(', ')}`,
      is_preview:  true,
      metadata:    { missingMonths },
    })
  }

  if (findings.length) {
    await supabase.schema('cge').from('findings').insert(findings)
  }

  // 6. Actualizar análisis con resultados
  await supabase.schema('cge').from('analyses').update({
    status:           'preview',
    total_kwh_billed: totalKwhBilled,
    difference_kwh:   Math.round(differenceKwh),
    difference_clp:   differenceCLP,
    avg_price_per_kwh: Math.round(avgPrice),
    bills_count:      sorted.length,
    period_start:     sorted[0]?.emissionDate,
    period_end:       sorted.at(-1)?.emissionDate,
    meter_status:     meterStatus,
  }).eq('id', analysis.id)

  return c.json({
    analysisId: analysis.id,
    preview: {
      billsCount:      sorted.length,
      totalKwhBilled:  Math.round(totalKwhBilled),
      meterReading,
      differenceKwh:   Math.abs(Math.round(differenceKwh)),
      differenceCLP,
      meterStatus,
      findingsCount:   findings.length,
      missingMonths:   missingMonths.length,
      periodStart:     sorted[0] ? `${sorted[0].periodMonth}/${sorted[0].periodYear}` : null,
      periodEnd:       sorted.at(-1) ? `${sorted.at(-1).periodMonth}/${sorted.at(-1).periodYear}` : null,
    }
  })
})

// ── GET /api/analyses/:id/preview ─────────────────────────────────────────
app.get('/api/analyses/:id/preview', async c => {
  const supabase = c.get('supabase')
  const id = c.req.param('id')

  const { data: analysis } = await supabase.schema('cge').from('analyses')
    .select('*').eq('id', id).single()
  if (!analysis) return c.json({ error: 'No encontrado' }, 404)

  const { data: findings } = await supabase.schema('cge').from('findings')
    .select('*').eq('analysis_id', id).eq('is_preview', true)

  return c.json({
    preview: {
      billsCount:      analysis.bills_count,
      totalKwhBilled:  analysis.total_kwh_billed,
      meterReading:    analysis.meter_reading,
      differenceKwh:   Math.abs(analysis.difference_kwh),
      differenceCLP:   analysis.difference_clp,
      meterStatus:     analysis.meter_status,
      findingsCount:   findings?.length ?? 0,
      missingMonths:   findings?.filter(f => f.type === 'missing_months')[0]?.metadata?.missingMonths?.length ?? 0,
      periodStart:     analysis.period_start,
      periodEnd:       analysis.period_end,
    }
  })
})

// ── GET /api/analyses/:id/detail ──────────────────────────────────────────
app.get('/api/analyses/:id/detail', async c => {
  const supabase = c.get('supabase')
  const id = c.req.param('id')

  const { data: analysis } = await supabase.schema('cge').from('analyses')
    .select('*').eq('id', id).single()
  if (!analysis) return c.json({ error: 'No encontrado' }, 404)
  if (analysis.status !== 'paid') return c.json({ error: 'Pago requerido', code: 'PAYMENT_REQUIRED' }, 402)

  const [{ data: bills }, { data: findings }] = await Promise.all([
    supabase.schema('cge').from('bills').select('*').eq('analysis_id', id).order('period_year').order('period_month'),
    supabase.schema('cge').from('findings').select('*').eq('analysis_id', id),
  ])

  const kwhs   = bills?.map(b => b.kwh_consumed) ?? []
  const avgKwh = kwhs.length ? Math.round(kwhs.reduce((a, b) => a + b, 0) / kwhs.length) : 0
  const maxBill = bills?.reduce((m, b) => b.kwh_consumed > (m?.kwh_consumed ?? 0) ? b : m, null)
  const minBill = bills?.reduce((m, b) => b.kwh_consumed < (m?.kwh_consumed ?? Infinity) ? b : m, null)

  return c.json({
    analysis,
    bills: bills?.map(b => ({
      period:            `${String(b.period_month).padStart(2,'0')}/${b.period_year}`,
      emissionDate:      b.emission_date,
      billNumber:        b.bill_number,
      kwhConsumed:       b.kwh_consumed,
      totalAmount:       b.total_amount,
      pricePerKwh:       b.price_per_kwh,
      isSpike:           findings?.some(f => f.bill_id === b.id && f.type === 'consumption_spike') ?? false,
      hasArithmeticIssue: b.has_arithmetic_issue,
    })),
    findings,
    avgMonthlyKwh:    avgKwh,
    avgMonthlyAmount: bills?.length ? Math.round(bills.reduce((s, b) => s + (b.total_amount ?? 0), 0) / bills.length) : 0,
    maxKwhMonth:      maxBill ? { period: `${String(maxBill.period_month).padStart(2,'0')}/${maxBill.period_year}`, kwhConsumed: maxBill.kwh_consumed } : null,
    minKwhMonth:      minBill ? { period: `${String(minBill.period_month).padStart(2,'0')}/${minBill.period_year}`, kwhConsumed: minBill.kwh_consumed } : null,
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
      back_urls: {
        success: `${c.env.SITE_URL}/?pago=ok&analysis_id=${id}`,
        failure: `${c.env.SITE_URL}/?pago=error`,
      },
      auto_return: 'approved',
      notification_url: `${c.env.WORKER_URL}/api/webhooks/mp`,
      metadata: { analysis_id: id },
    }),
  })
  const mp = await mpRes.json()
  if (!mp.id) return c.json({ error: 'Error creando preferencia MP' }, 500)

  await supabase.schema('cge').from('payments').insert({
    analysis_id: id, provider_order_id: mp.id, amount: 2990,
  })

  return c.json({ preferenceId: mp.id, initPoint: mp.init_point })
})

// ── POST /api/webhooks/mp ──────────────────────────────────────────────────
app.post('/api/webhooks/mp', async c => {
  const supabase = c.get('supabase')
  const body = await c.req.json()
  if (body.type !== 'payment') return c.json({ ok: true })

  const payRes  = await fetch(`https://api.mercadopago.com/v1/payments/${body.data.id}`, {
    headers: { 'Authorization': `Bearer ${c.env.MP_ACCESS_TOKEN}` },
  })
  const payment = await payRes.json()
  if (payment.status !== 'approved') return c.json({ ok: true })

  const analysisId = payment.metadata?.analysis_id
  if (!analysisId) return c.json({ ok: true })

  await supabase.schema('cge').from('payments').update({
    status: 'approved', provider_payment_id: String(payment.id), paid_at: new Date().toISOString(),
  }).eq('analysis_id', analysisId).eq('status', 'pending')

  await supabase.schema('cge').from('analyses').update({ status: 'paid' }).eq('id', analysisId)

  return c.json({ ok: true })
})

export default app
