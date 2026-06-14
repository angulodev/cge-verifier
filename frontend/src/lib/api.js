const BASE = import.meta.env.VITE_WORKER_URL

async function req(path, options = {}, token) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Análisis ──────────────────────────────────────────────────────────────────

/** Crea un análisis vacío y retorna su ID */
export function createAnalysis(meterReading, token) {
  return req('/api/analyses', {
    method: 'POST',
    body: JSON.stringify({ meter_reading: meterReading }),
  }, token)
}

/** Obtiene URL firmada para subir un PDF directo a R2 */
export function getUploadUrl(analysisId, fileName, token) {
  return req(`/api/analyses/${analysisId}/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ fileName }),
  }, token)
}

/** Sube el archivo directo a R2 usando la URL firmada */
export async function uploadToR2(signedUrl, file) {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  })
  if (!res.ok) throw new Error(`Error subiendo archivo: HTTP ${res.status}`)
}

/** Dispara el procesamiento de todas las boletas subidas */
export function processAnalysis(analysisId, bills, token) {
  return req(`/api/analyses/${analysisId}/process`, {
    method: 'POST',
    body: JSON.stringify({ bills }),
  }, token)
}

/** Obtiene el preview gratuito del análisis */
export function getPreview(analysisId, token) {
  return req(`/api/analyses/${analysisId}/preview`, {}, token)
}

/** Inicia el pago con Mercado Pago — retorna initPoint */
export function startPayment(analysisId, token) {
  return req(`/api/analyses/${analysisId}/pay`, { method: 'POST' }, token)
}

/** Obtiene el reporte completo (solo si está pagado) */
export function getReport(analysisId, token) {
  return req(`/api/analyses/${analysisId}/detail`, {}, token)
}

/** Historial de análisis del usuario */
export function getUserHistory(token) {
  return req('/api/analyses', {}, token)
}
