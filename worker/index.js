import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClient } from '@supabase/supabase-js';
import { parseCGEBill, analyzeBills } from '../parser/index.js';

const app = new Hono();

app.use('*', cors());

// ── Middleware: Supabase client por request ───────────────────
app.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const supabase = createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
  );
  c.set('supabase', supabase);
  await next();
});

// ── GET /health ───────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true, module: 'cge-verifier' }));

// ── POST /api/analyses ────────────────────────────────────────
// Crea un nuevo análisis (sin boletas aún)
app.post('/api/analyses', async (c) => {
  const supabase = c.get('supabase');
  const { meter_reading } = await c.req.json();

  if (!meter_reading || isNaN(meter_reading)) {
    return c.json({ error: 'meter_reading requerido' }, 400);
  }

  const { data, error } = await supabase
    .from('cge.analyses')
    .insert({ meter_reading })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ analysis: data });
});

// ── POST /api/analyses/:id/upload-url ────────────────────────
// Genera URL firmada para subir un PDF directo a R2
app.post('/api/analyses/:id/upload-url', async (c) => {
  const analysisId = c.req.param('id');
  const { fileName } = await c.req.json();

  if (!fileName?.endsWith('.pdf')) {
    return c.json({ error: 'Solo se aceptan archivos PDF' }, 400);
  }

  const r2Key = `cge/${analysisId}/${Date.now()}-${fileName}`;

  // URL firmada de Cloudflare R2 (PUT)
  const url = await c.env.CGE_BUCKET.createPresignedUrl('PUT', r2Key, {
    expiresIn: 3600,
    httpMetadata: { contentType: 'application/pdf' },
  });

  return c.json({ uploadUrl: url, r2Key });
});

// ── POST /api/analyses/:id/process ───────────────────────────
// Procesa todas las boletas subidas y genera el análisis
app.post('/api/analyses/:id/process', async (c) => {
  const supabase    = c.get('supabase');
  const analysisId  = c.req.param('id');
  const { bills: billsInput } = await c.req.json();
  // billsInput: [{ r2Key, fileName }]

  // 1. Marcar como procesando
  await supabase.schema('cge').from('analyses').update({ status: 'processing' }).eq('id', analysisId);

  const parsedBills = [];

  // 2. Procesar cada PDF desde R2
  for (const { r2Key, fileName } of billsInput) {
    try {
      const object = await c.env.CGE_BUCKET.get(r2Key);
      if (!object) continue;

      const arrayBuffer = await object.arrayBuffer();
      const buffer      = Buffer.from(arrayBuffer);
      const parsed      = await parseCGEBill(buffer, fileName);

      if (parsed.success) {
        // Calcular período
        const [yyyy, mm] = parsed.emissionDate.split('-');
        let periodMonth = parseInt(mm) - 1;
        let periodYear  = parseInt(yyyy);
        if (periodMonth === 0) { periodMonth = 12; periodYear -= 1; }

        // Insertar en DB
        const { data: bill } = await supabase.schema('cge').from('bills').insert({
          analysis_id:          analysisId,
          bill_number:          parsed.billNumber,
          client_number:        parsed.clientNumber,
          client_address:       parsed.clientAddress,
          emission_date:        parsed.emissionDate,
          period_month:         periodMonth,
          period_year:          periodYear,
          kwh_consumed:         parsed.kwhConsumed,
          total_boleta:         parsed.totalBoleta,
          total_ajustes:        parsed.totalAjustes,
          total_amount:         parsed.totalAmount,
          price_per_kwh:        parsed.pricePerKwh,
          charges:              parsed.charges,
          r2_key:               r2Key,
          file_name:            fileName,
          has_arithmetic_issue: !!parsed.arithmeticIssue,
        }).select().single();

        parsedBills.push({ ...parsed, dbId: bill?.id });

        // Si hay error aritmético, crear finding
        if (parsed.arithmeticIssue) {
          await supabase.schema('cge').from('findings').insert({
            analysis_id:    analysisId,
            bill_id:        bill?.id,
            type:           'billing_arithmetic',
            severity:       'critical',
            description:    parsed.arithmeticIssue.description,
            amount_affected: parsed.arithmeticIssue.diferencia,
            is_preview:     false,
          });
        }
      }
    } catch (err) {
      console.error(`Error procesando ${fileName}:`, err.message);
    }
  }

  if (parsedBills.length === 0) {
    await supabase.schema('cge').from('analyses').update({ status: 'error' }).eq('id', analysisId);
    return c.json({ error: 'No se pudo procesar ninguna boleta' }, 422);
  }

  // 3. Obtener lectura del medidor
  const { data: analysis } = await supabase.schema('cge').from('analyses').select('meter_reading').eq('id', analysisId).single();
  const meterReading = analysis?.meter_reading ?? 0;

  // 4. Calcular cuadratura
  const result = analyzeBills(parsedBills, meterReading);
  const { preview, detail } = result;

  // 5. Guardar findings generales
  const findings = [];

  // Hallazgo principal: cuadratura con medidor
  if (preview.meterStatus !== 'ok') {
    findings.push({
      analysis_id:    analysisId,
      type:           'meter_mismatch',
      severity:       'critical',
      description:    preview.meterStatus === 'overbilled'
        ? `Te cobraron ${preview.differenceKwh} kWh de más (~$${preview.differenceCLP.toLocaleString('es-CL')})`
        : `Hay ${preview.differenceKwh} kWh sin facturar`,
      amount_affected: preview.differenceCLP,
      is_preview:     true, // visible gratis
      metadata:       { differenceKwh: preview.differenceKwh, meterStatus: preview.meterStatus },
    });
  }

  // Picos de consumo
  for (const spike of detail.spikes) {
    findings.push({
      analysis_id:    analysisId,
      type:           'consumption_spike',
      severity:       'warning',
      description:    `${spike.period}: ${spike.description}`,
      is_preview:     false,
      metadata:       spike,
    });
  }

  // Meses faltantes
  if (detail.missingMonths.length > 0) {
    findings.push({
      analysis_id: analysisId,
      type:        'missing_months',
      severity:    'info',
      description: `Faltan ${detail.missingMonths.length} boleta(s): ${detail.missingMonths.map(m => m.label).join(', ')}`,
      is_preview:  true,
      metadata:    { missingMonths: detail.missingMonths },
    });
  }

  if (findings.length > 0) {
    await supabase.schema('cge').from('findings').insert(findings);
  }

  // 6. Actualizar análisis con resultados
  const sorted = parsedBills.filter(b => b.success).sort((a, b) =>
    a.periodYear !== b.periodYear ? a.periodYear - b.periodYear : a.periodMonth - b.periodMonth
  );

  await supabase.schema('cge').from('analyses').update({
    status:           'preview',
    total_kwh_billed: preview.totalKwhBilled,
    difference_kwh:   preview.differenceKwh * (preview.meterStatus === 'overbilled' ? -1 : 1),
    difference_clp:   preview.differenceCLP,
    avg_price_per_kwh: detail.avgMonthlyAmount && preview.totalKwhBilled
      ? Math.round(detail.avgMonthlyAmount * sorted.length / preview.totalKwhBilled)
      : null,
    bills_count:      parsedBills.length,
    period_start:     sorted[0]?.emissionDate,
    period_end:       sorted.at(-1)?.emissionDate,
    meter_status:     preview.meterStatus,
  }).eq('id', analysisId);

  return c.json({ preview, missingMonths: detail.missingMonths });
});

// ── GET /api/analyses/:id/preview ────────────────────────────
app.get('/api/analyses/:id/preview', async (c) => {
  const supabase   = c.get('supabase');
  const analysisId = c.req.param('id');

  const { data, error } = await supabase
    .schema('cge')
    .rpc('get_analysis_preview', { p_analysis_id: analysisId });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ preview: data });
});

// ── GET /api/analyses/:id/detail ─────────────────────────────
// Solo disponible si status = 'paid'
app.get('/api/analyses/:id/detail', async (c) => {
  const supabase   = c.get('supabase');
  const analysisId = c.req.param('id');

  const { data: analysis } = await supabase.schema('cge').from('analyses')
    .select('status, meter_status, total_kwh_billed, meter_reading, difference_kwh, difference_clp, bills_count, period_start, period_end')
    .eq('id', analysisId).single();

  if (!analysis) return c.json({ error: 'Análisis no encontrado' }, 404);
  if (analysis.status !== 'paid') return c.json({ error: 'Pago requerido', code: 'PAYMENT_REQUIRED' }, 402);

  const { data: bills } = await supabase.schema('cge').from('bills')
    .select('*').eq('analysis_id', analysisId)
    .order('period_year').order('period_month');

  const { data: findings } = await supabase.schema('cge').from('findings')
    .select('*').eq('analysis_id', analysisId);

  return c.json({ analysis, bills, findings });
});

// ── POST /api/analyses/:id/pay ────────────────────────────────
// Crea preferencia de pago en Mercado Pago
app.post('/api/analyses/:id/pay', async (c) => {
  const supabase   = c.get('supabase');
  const analysisId = c.req.param('id');

  // Crear preferencia en MP
  const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${c.env.MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      items: [{
        title: 'AuditaCGE - Reporte completo',
        quantity: 1,
        unit_price: 2990,
        currency_id: 'CLP',
      }],
      back_urls: {
        success: `${c.env.SITE_URL}/analisis/${analysisId}?pago=ok`,
        failure: `${c.env.SITE_URL}/analisis/${analysisId}?pago=error`,
      },
      auto_return: 'approved',
      notification_url: `${c.env.WORKER_URL}/api/webhooks/mp`,
      metadata: { analysis_id: analysisId },
    }),
  });

  const mp = await mpResponse.json();
  if (!mp.id) return c.json({ error: 'Error creando preferencia de pago' }, 500);

  // Guardar referencia del pago
  await supabase.schema('cge').from('payments').insert({
    analysis_id:      analysisId,
    provider_order_id: mp.id,
    amount:           2990,
  });

  return c.json({ preferenceId: mp.id, initPoint: mp.init_point });
});

// ── POST /api/webhooks/mp ─────────────────────────────────────
// Webhook de Mercado Pago para confirmar pagos
app.post('/api/webhooks/mp', async (c) => {
  const supabase = c.get('supabase');
  const body     = await c.req.json();

  if (body.type !== 'payment') return c.json({ ok: true });

  // Verificar pago en MP
  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${body.data.id}`, {
    headers: { 'Authorization': `Bearer ${c.env.MP_ACCESS_TOKEN}` },
  });
  const payment = await paymentRes.json();

  if (payment.status !== 'approved') return c.json({ ok: true });

  const analysisId = payment.metadata?.analysis_id;
  if (!analysisId) return c.json({ ok: true });

  // Confirmar pago y desbloquear reporte
  await supabase.schema('cge').rpc('confirm_payment', {
    p_analysis_id:        analysisId,
    p_provider_payment_id: String(payment.id),
  });

  return c.json({ ok: true });
});

export default app;
