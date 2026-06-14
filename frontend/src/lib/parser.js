import * as pdfjsLib from 'pdfjs-dist'

// Worker de pdf.js (necesario para que funcione en browser)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

// ─── Patterns ────────────────────────────────────────────────────────────────
const P = {
  clientNumber:  /N[ºo°]\s*Cliente:\s*(\d+)/i,
  billNumber:    /Ref\.\s*Boleta\/Fatura\s*N[ºo°]:\s*(\d+)/i,
  emissionDate:  /Fecha\s*Emisi[oó]n\s*de\s*Facturaci[oó]n:\s*(\d{2}-\d{2}-\d{4})/i,
  kwhConsumed:   /Cargo\s+energ[ií]a\s*\((\d+(?:[.,]\d+)?)\s*kWh\)/i,
  totalBoleta:   /Total\s+Boleta:\s*\$?\s*([\d.]+)/i,
  totalPagar:    /TOTAL\s+A\s+PAGAR:\s*\$?\s*([\d.]+)/i,
  adminServicio: /Administraci[oó]n del servicio\s*\$\s*([\d.]+)/i,
  transporte:    /Transporte de electricidad\s*\$\s*([\d.]+)/i,
  cargoPublico:  /Cargo servicio p[uú]blico\s*\$\s*([\d.]+)/i,
  cargoPotencia: /Cargo compra potencia bt1[^$\n]*\$\s*([\d.]+)/i,
  cargoBase:     /Cargo pot\.base distribuci[oó]n[^$\n]*\$\s*([\d.]+)/i,
  cargoEnergia:  /Cargo energ[ií]a[^$\n]*\$\s*([\d.]+)/i,
  ajusteAnt:     /mes anterior\s*\$\s*([\d.]+)/i,
  ajusteAct:     /mes actual\s*\$\s*(-?[\d.]+)/i,
}

function ex(text, pat) {
  const m = text.match(pat)
  return m ? m[1].trim() : null
}

function clp(str) {
  if (!str) return null
  return parseFloat(str.replace(/\./g, ''))
}

/**
 * Extrae texto de un PDF usando pdf.js (browser)
 * @param {File} file
 * @returns {Promise<string>}
 */
async function extractText(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text          = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map(item => item.str).join(' ') + '\n'
  }
  return text
}

/**
 * Parsea una boleta CGE en el browser.
 * Retorna los datos estructurados listos para enviar al Worker.
 */
export async function parseCGEBillBrowser(file) {
  let text
  try {
    text = await extractText(file)
  } catch (e) {
    return { success: false, fileName: file.name, error: `No se pudo leer el PDF: ${e.message}` }
  }

  const kwhRaw      = ex(text, P.kwhConsumed)
  const kwhConsumed = kwhRaw ? parseInt(kwhRaw) : null
  const rawDate     = ex(text, P.emissionDate)

  let emissionDate = null, periodMonth = null, periodYear = null
  if (rawDate) {
    const [dd, mm, yyyy] = rawDate.split('-')
    emissionDate = `${yyyy}-${mm}-${dd}`
    periodMonth  = parseInt(mm) - 1 || 12
    periodYear   = parseInt(mm) === 1 ? parseInt(yyyy) - 1 : parseInt(yyyy)
  }

  if (!kwhConsumed || !emissionDate) {
    return { success: false, fileName: file.name, error: 'No se detectaron los campos clave (kWh o fecha)' }
  }

  const totalBoleta = clp(ex(text, P.totalBoleta))
  const totalAmount = clp(ex(text, P.totalPagar))

  const charges = {
    adminServicio:  clp(ex(text, P.adminServicio)),
    transporte:     clp(ex(text, P.transporte)),
    cargoPublico:   clp(ex(text, P.cargoPublico)),
    cargoPotencia:  clp(ex(text, P.cargoPotencia)),
    cargoBase:      clp(ex(text, P.cargoBase)),
    cargoEnergia:   clp(ex(text, P.cargoEnergia)),
    ajusteAnterior: clp(ex(text, P.ajusteAnt)),
    ajusteActual:   clp(ex(text, P.ajusteAct)),
  }

  const sumServicios = [
    charges.adminServicio, charges.transporte, charges.cargoPublico,
    charges.cargoPotencia, charges.cargoBase, charges.cargoEnergia,
  ].filter(Boolean).reduce((a, b) => a + b, 0)

  const hasArithmeticIssue = totalBoleta && Math.abs(sumServicios - totalBoleta) > 5

  return {
    success: true,
    fileName:         file.name,
    clientNumber:     ex(text, P.clientNumber),
    billNumber:       ex(text, P.billNumber),
    emissionDate,
    periodMonth,
    periodYear,
    kwhConsumed,
    totalBoleta,
    totalAjustes:     (charges.ajusteAnterior ?? 0) + (charges.ajusteActual ?? 0),
    totalAmount,
    pricePerKwh:      kwhConsumed && totalBoleta ? Math.round(totalBoleta / kwhConsumed) : null,
    charges,
    hasArithmeticIssue,
  }
}
