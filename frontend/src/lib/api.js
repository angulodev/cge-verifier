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
    const msg = err.code ?? err.error ?? `HTTP ${res.status}`
    throw new Error(msg)
  }
  return res.json()
}

/**
 * Envía los datos ya parseados al Worker (JSON, no PDFs).
 * El parsing ocurre en el browser con pdfjs-dist.
 */
export function createAndProcess(parsedBills, meterReading, token) {
  return req('/api/analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meter_reading: meterReading, bills: parsedBills }),
  }, token)
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
