const BASE = import.meta.env.VITE_WORKER_URL

async function req(path, options = {}, token) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
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

/**
 * Crea el análisis Y procesa los PDFs en una sola llamada.
 * Los PDFs se envían como multipart/form-data, se parsean en el Worker
 * en memoria y se descartan. Solo los datos quedan en Supabase.
 */
export async function createAndProcess(files, meterReading, token) {
  const form = new FormData()
  form.append('meter_reading', String(meterReading))
  for (const file of files) {
    form.append('bills', file)
  }
  return req('/api/analyses', { method: 'POST', body: form }, token)
}

export function getPreview(analysisId, token) {
  return req(`/api/analyses/${analysisId}/preview`, {}, token)
}

export function startPayment(analysisId, token) {
  return req(`/api/analyses/${analysisId}/pay`, { method: 'POST' }, token)
}

export function getReport(analysisId, token) {
  return req(`/api/analyses/${analysisId}/detail`, {}, token)
}
