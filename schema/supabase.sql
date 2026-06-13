-- ============================================================
-- AuditaCGE - Schema Supabase
-- Módulo: cge (aislado del schema público)
-- Proyecto: cms-core (us-east-1)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS cge;

-- ── Habilitar RLS en todas las tablas ────────────────────────

-- ── 1. ANALYSES ──────────────────────────────────────────────
-- Una sesión de análisis por usuario
CREATE TABLE cge.analyses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Estado del análisis
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','preview','paid','error')),

  -- Lectura física del medidor ingresada por el usuario
  meter_reading     NUMERIC(10,2) NOT NULL,

  -- Resultados del análisis (calculados al procesar)
  total_kwh_billed  NUMERIC(10,2),          -- Σ kWh de todas las boletas
  difference_kwh    NUMERIC(10,2),          -- meter_reading - total_kwh_billed
  difference_clp    NUMERIC(12,2),          -- diferencia estimada en pesos
  avg_price_per_kwh NUMERIC(8,2),           -- precio promedio $/kWh del período

  -- Metadatos del período
  bills_count       INTEGER DEFAULT 0,
  period_start      DATE,                   -- inicio del período analizado
  period_end        DATE,                   -- fin del período analizado

  -- Resultado de cuadratura
  meter_status      TEXT                    -- 'ok' | 'overbilled' | 'underbilled'
                    CHECK (meter_status IN ('ok','overbilled','underbilled')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cge.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_analyses" ON cge.analyses
  FOR ALL USING (auth.uid() = user_id);

-- ── 2. BILLS ─────────────────────────────────────────────────
-- Una fila por boleta PDF procesada
CREATE TABLE cge.bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id     UUID NOT NULL REFERENCES cge.analyses(id) ON DELETE CASCADE,

  -- Identificación extraída del PDF
  bill_number     TEXT,                     -- Ref. Boleta/Fatura Nº
  client_number   TEXT,                     -- Nº Cliente
  client_address  TEXT,                     -- Dirección del Cliente
  emission_date   DATE,                     -- Fecha Emisión de Facturación

  -- Período de consumo (calculado: mes anterior a la emisión)
  period_month    INTEGER CHECK (period_month BETWEEN 1 AND 12),
  period_year     INTEGER CHECK (period_year BETWEEN 2000 AND 2100),

  -- ⚡ DATO CLAVE
  kwh_consumed    NUMERIC(8,2) NOT NULL,    -- extraído de "Cargo energía (N kWh)"

  -- Montos
  total_boleta    NUMERIC(12,2),            -- Total Boleta (solo servicios)
  total_ajustes   NUMERIC(12,2),            -- Suma de ajustes (Otros)
  total_amount    NUMERIC(12,2),            -- TOTAL A PAGAR
  price_per_kwh   NUMERIC(8,2),            -- total_boleta / kwh_consumed

  -- Cargos individuales (para validación aritmética)
  charges         JSONB,                    -- { adminServicio, transporte, ... }

  -- Almacenamiento
  r2_key          TEXT,                     -- ruta del PDF en Cloudflare R2
  file_name       TEXT,                     -- nombre original del archivo

  -- Hallazgo aritmético de esta boleta (si lo hay)
  has_arithmetic_issue BOOLEAN DEFAULT FALSE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cge.bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_bills" ON cge.bills
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cge.analyses a
      WHERE a.id = analysis_id AND a.user_id = auth.uid()
    )
  );

CREATE INDEX idx_bills_analysis_id ON cge.bills(analysis_id);
CREATE INDEX idx_bills_period      ON cge.bills(period_year, period_month);

-- ── 3. FINDINGS ──────────────────────────────────────────────
-- Inconsistencias detectadas en el análisis
CREATE TABLE cge.findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id     UUID NOT NULL REFERENCES cge.analyses(id) ON DELETE CASCADE,
  bill_id         UUID REFERENCES cge.bills(id) ON DELETE SET NULL,

  -- Tipo de hallazgo
  type            TEXT NOT NULL
                  CHECK (type IN (
                    'meter_mismatch',     -- Σ boletas ≠ medidor
                    'consumption_spike',  -- pico estadístico (vacaciones, etc.)
                    'billing_arithmetic', -- cargos no cuadran con total
                    'missing_months'      -- meses sin boleta
                  )),
  severity        TEXT NOT NULL
                  CHECK (severity IN ('critical','warning','info')),

  -- Detalle
  description     TEXT NOT NULL,
  amount_affected NUMERIC(12,2),          -- impacto estimado en CLP

  -- Control de visibilidad (preview gratis vs reporte pagado)
  is_preview      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Datos adicionales del hallazgo
  metadata        JSONB,                  -- datos específicos del tipo

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cge.findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_findings" ON cge.findings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cge.analyses a
      WHERE a.id = analysis_id AND a.user_id = auth.uid()
    )
  );

CREATE INDEX idx_findings_analysis_id ON cge.findings(analysis_id);
CREATE INDEX idx_findings_type        ON cge.findings(type, severity);

-- ── 4. PAYMENTS ──────────────────────────────────────────────
-- Registro de transacciones de pago
CREATE TABLE cge.payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id         UUID NOT NULL REFERENCES cge.analyses(id) ON DELETE RESTRICT,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  provider            TEXT NOT NULL DEFAULT 'mercadopago',
  provider_payment_id TEXT,               -- ID de la transacción en MP
  provider_order_id   TEXT,               -- preference_id de Mercado Pago

  amount              NUMERIC(10,2) NOT NULL DEFAULT 2990,
  currency            TEXT NOT NULL DEFAULT 'CLP',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','refunded')),

  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cge.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_payments" ON cge.payments
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_payments_analysis_id ON cge.payments(analysis_id);
CREATE INDEX idx_payments_status      ON cge.payments(status);

-- ── 5. TRIGGER: updated_at automático ────────────────────────
CREATE OR REPLACE FUNCTION cge.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_analyses_updated_at
  BEFORE UPDATE ON cge.analyses
  FOR EACH ROW EXECUTE FUNCTION cge.update_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON cge.payments
  FOR EACH ROW EXECUTE FUNCTION cge.update_updated_at();

-- ── 6. RPC FUNCTIONS (acceso público desde frontend) ─────────

-- Obtener resumen de un análisis (preview gratuito)
CREATE OR REPLACE FUNCTION cge.get_analysis_preview(p_analysis_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis cge.analyses%ROWTYPE;
  v_result   JSONB;
BEGIN
  SELECT * INTO v_analysis FROM cge.analyses
  WHERE id = p_analysis_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Analysis not found or access denied';
  END IF;

  SELECT jsonb_build_object(
    'id',                v_analysis.id,
    'status',            v_analysis.status,
    'bills_count',       v_analysis.bills_count,
    'total_kwh_billed',  v_analysis.total_kwh_billed,
    'meter_reading',     v_analysis.meter_reading,
    'difference_kwh',    v_analysis.difference_kwh,
    'difference_clp',    v_analysis.difference_clp,
    'meter_status',      v_analysis.meter_status,
    'period_start',      v_analysis.period_start,
    'period_end',        v_analysis.period_end,
    'findings_count',    (SELECT COUNT(*) FROM cge.findings WHERE analysis_id = p_analysis_id),
    'preview_findings',  (
      SELECT jsonb_agg(jsonb_build_object(
        'type', type, 'severity', severity, 'description', description
      ))
      FROM cge.findings
      WHERE analysis_id = p_analysis_id AND is_preview = TRUE
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Confirmar pago y desbloquear reporte completo
CREATE OR REPLACE FUNCTION cge.confirm_payment(
  p_analysis_id       UUID,
  p_provider_payment_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Marcar pago como aprobado
  UPDATE cge.payments
  SET status = 'approved',
      provider_payment_id = p_provider_payment_id,
      paid_at = NOW()
  WHERE analysis_id = p_analysis_id
    AND user_id = auth.uid()
    AND status = 'pending';

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Desbloquear el análisis completo
  UPDATE cge.analyses
  SET status = 'paid'
  WHERE id = p_analysis_id AND user_id = auth.uid();

  RETURN TRUE;
END;
$$;

-- ── 7. VIEW: historial del usuario ────────────────────────────
CREATE OR REPLACE VIEW cge.user_history AS
SELECT
  a.id,
  a.status,
  a.meter_status,
  a.bills_count,
  a.total_kwh_billed,
  a.meter_reading,
  a.difference_kwh,
  a.difference_clp,
  a.period_start,
  a.period_end,
  a.created_at,
  EXISTS(
    SELECT 1 FROM cge.payments p
    WHERE p.analysis_id = a.id AND p.status = 'approved'
  ) AS is_paid,
  (SELECT COUNT(*) FROM cge.findings f WHERE f.analysis_id = a.id) AS findings_count
FROM cge.analyses a
WHERE a.user_id = auth.uid();

-- ── Comentarios de documentación ─────────────────────────────
COMMENT ON SCHEMA cge IS 'Módulo AuditaCGE - verificación de boletas de electricidad';
COMMENT ON TABLE cge.analyses IS 'Una sesión de análisis por usuario';
COMMENT ON TABLE cge.bills    IS 'Una fila por boleta PDF procesada';
COMMENT ON TABLE cge.findings IS 'Inconsistencias detectadas';
COMMENT ON TABLE cge.payments IS 'Transacciones de Mercado Pago';
COMMENT ON COLUMN cge.bills.kwh_consumed IS 'Extraído de "Cargo energía (N kWh)" - fuente de verdad del consumo mensual';
