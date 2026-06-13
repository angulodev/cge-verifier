import pdfParse from 'pdf-parse';
import { readFile } from 'fs/promises';
import { PATTERNS } from './patterns.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convierte montos chilenos a número.
 * Soporta: "81.829", "1.052", "-11", "81.900"
 * El punto es separador de miles en CLP.
 */
function parseCLP(str) {
  if (!str) return null;
  // Quitar puntos de miles, reemplazar coma decimal (si hay) por punto
  const clean = str.trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

/**
 * Parsea fecha DD-MM-YYYY → ISO string YYYY-MM-DD
 */
function parseDate(str) {
  if (!str) return null;
  const [dd, mm, yyyy] = str.split('-');
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Extrae un campo usando un patrón regex.
 * Retorna el grupo 1 o null.
 */
function extract(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

// ─── Parser principal ─────────────────────────────────────────────────────────

/**
 * Parsea una boleta CGE desde un Buffer de PDF.
 * 
 * @param {Buffer} pdfBuffer - Buffer del archivo PDF
 * @param {string} fileName  - Nombre del archivo (para logging)
 * @returns {Object} Datos estructurados de la boleta
 */
export async function parseCGEBill(pdfBuffer, fileName = 'unknown.pdf') {
  // 1. Extraer texto del PDF
  let text;
  try {
    const data = await pdfParse(pdfBuffer);
    text = data.text;
  } catch (err) {
    return {
      success: false,
      fileName,
      error: `No se pudo leer el PDF: ${err.message}`,
    };
  }

  if (!text || text.trim().length < 50) {
    return {
      success: false,
      fileName,
      error: 'PDF vacío o sin capa de texto (posible escaneo)',
    };
  }

  // 2. Extraer campos
  const rawKwh     = extract(text, PATTERNS.kwhConsumed) 
                  ?? extract(text, PATTERNS.kwhFallback);
  const rawDate    = extract(text, PATTERNS.emissionDate);
  const rawTotal   = extract(text, PATTERNS.totalPagar);
  const rawBoleta  = extract(text, PATTERNS.totalBoleta);

  const kwhConsumed   = rawKwh   ? parseFloat(rawKwh.replace(',', '.')) : null;
  const emissionDate  = parseDate(rawDate);
  const totalAmount   = parseCLP(rawTotal);
  const totalBoleta   = parseCLP(rawBoleta);

  // 3. Extraer cargos individuales para validación aritmética
  const charges = {
    adminServicio:  parseCLP(extract(text, PATTERNS.adminServicio)),
    transporte:     parseCLP(extract(text, PATTERNS.transporte)),
    cargoPublico:   parseCLP(extract(text, PATTERNS.cargoPublico)),
    cargoPotencia:  parseCLP(extract(text, PATTERNS.cargoPotencia)),
    cargoBase:      parseCLP(extract(text, PATTERNS.cargoBase)),
    cargoEnergia:   parseCLP(extract(text, PATTERNS.cargoEnergia)),
    ajusteAnterior: parseCLP(extract(text, PATTERNS.ajusteAnterior)),
    ajusteActual:   parseCLP(extract(text, PATTERNS.ajusteActual)),
    otros:          parseCLP(extract(text, PATTERNS.otros)),
  };

  // 4. Validación aritmética interna de la boleta
  const arithmeticIssue = validateArithmetic(charges, totalBoleta);

  // 5. Validación de campos críticos
  const missing = [];
  if (!kwhConsumed)  missing.push('kWh');
  if (!emissionDate) missing.push('fecha');
  if (!totalAmount)  missing.push('total');

  if (missing.length > 0) {
    return {
      success: false,
      fileName,
      error: `Campos críticos no detectados: ${missing.join(', ')}`,
      rawText: text, // útil para debug
    };
  }

  // 6. Extraer período (mes/año) de la fecha de emisión
  // Asumimos que la boleta corresponde al mes anterior a la emisión
  // (CGE emite la boleta ~9 días después del periodo)
  const [yyyy, mm] = emissionDate.split('-');
  let periodMonth = parseInt(mm, 10);
  let periodYear  = parseInt(yyyy, 10);
  // Retroceder un mes para el período real
  if (periodMonth === 1) { periodMonth = 12; periodYear -= 1; }
  else                   { periodMonth -= 1; }

  return {
    success: true,
    fileName,

    // Identificación
    clientNumber:  extract(text, PATTERNS.clientNumber),
    clientAddress: extract(text, PATTERNS.clientAddress),
    billNumber:    extract(text, PATTERNS.billNumber),

    // Temporal
    emissionDate,   // YYYY-MM-DD
    periodMonth,    // 1-12 (mes real de consumo)
    periodYear,

    // Consumo — el dato más importante
    kwhConsumed,

    // Montos
    totalBoleta,
    totalAmount,   // TOTAL A PAGAR (incluye redondeo)

    // Cargos detallados
    charges,

    // Hallazgo aritmético (si hay)
    arithmeticIssue,

    // Precio por kWh efectivo (para estimaciones)
    pricePerKwh: kwhConsumed > 0 && totalBoleta
      ? Math.round(totalBoleta / kwhConsumed)
      : null,
  };
}

// ─── Validación aritmética ────────────────────────────────────────────────────

function validateArithmetic(charges, totalBoleta) {
  const servicios = [
    charges.adminServicio,
    charges.transporte,
    charges.cargoPublico,
    charges.cargoPotencia,
    charges.cargoBase,
    charges.cargoEnergia,
    charges.ajusteAnterior,
    charges.ajusteActual,
  ].filter(v => v !== null);

  if (servicios.length < 4 || !totalBoleta) return null;

  const sumaCargos = servicios.reduce((a, b) => a + b, 0);
  const diferencia = Math.round(Math.abs(sumaCargos - totalBoleta));

  // Tolerancia de $5 CLP por redondeos
  if (diferencia > 5) {
    return {
      type: 'billing_arithmetic',
      severity: 'critical',
      sumaCargos: Math.round(sumaCargos),
      totalDeclarado: totalBoleta,
      diferencia,
      description: `Los cargos suman $${Math.round(sumaCargos).toLocaleString('es-CL')} pero el Total Boleta dice $${totalBoleta.toLocaleString('es-CL')} (diferencia: $${diferencia})`,
    };
  }

  return null;
}

// ─── Análisis multi-boleta ────────────────────────────────────────────────────

/**
 * Analiza un conjunto de boletas y las compara con la lectura del medidor.
 * 
 * @param {Array}  bills        - Array de resultados de parseCGEBill (success: true)
 * @param {number} meterReading - Lectura actual del medidor (kWh)
 * @returns {Object} Análisis completo con hallazgos
 */
export function analyzeBills(bills, meterReading) {
  // Solo procesar boletas exitosas
  const valid = bills.filter(b => b.success);
  if (valid.length === 0) {
    return { success: false, error: 'No hay boletas válidas para analizar' };
  }

  // Ordenar cronológicamente
  const sorted = [...valid].sort((a, b) => {
    if (a.periodYear !== b.periodYear) return a.periodYear - b.periodYear;
    return a.periodMonth - b.periodMonth;
  });

  // Suma total de kWh facturados
  const totalKwhBilled = sorted.reduce((sum, b) => sum + b.kwhConsumed, 0);

  // Diferencia con medidor
  const differenceKwh = meterReading - totalKwhBilled;

  // Precio promedio por kWh (para estimar diferencia en pesos)
  const avgPricePerKwh = sorted
    .filter(b => b.pricePerKwh)
    .reduce((sum, b, _, arr) => sum + b.pricePerKwh / arr.length, 0);

  const differenceCLP = Math.round(Math.abs(differenceKwh) * avgPricePerKwh);

  // ── Detectar meses faltantes ─────────────────────────────────────────────
  const missingMonths = detectMissingMonths(sorted);

  // ── Detectar picos de consumo (vacaciones, etc.) ─────────────────────────
  const spikes = detectSpikes(sorted);

  // ── Recopilar hallazgos aritméticos ──────────────────────────────────────
  const arithmeticIssues = sorted
    .filter(b => b.arithmeticIssue)
    .map(b => ({ ...b.arithmeticIssue, billNumber: b.billNumber, emissionDate: b.emissionDate }));

  // ── Clasificar resultado ─────────────────────────────────────────────────
  let meterStatus;
  if (Math.abs(differenceKwh) <= 2) {
    meterStatus = 'ok';           // ✅ Cuadra (tolerancia mínima)
  } else if (differenceKwh < 0) {
    meterStatus = 'overbilled';   // ⚠️ Cobraron de más
  } else {
    meterStatus = 'underbilled';  // ℹ️ Consumo real mayor al facturado
  }

  // ── Preview (lo que se muestra gratis) ────────────────────────────────────
  const preview = {
    billsAnalyzed:   sorted.length,
    totalKwhBilled:  Math.round(totalKwhBilled),
    meterReading,
    differenceKwh:   Math.round(Math.abs(differenceKwh)),
    differenceCLP,
    meterStatus,
    findingsCount:   spikes.length + arithmeticIssues.length + (missingMonths.length > 0 ? 1 : 0),
    missingMonthsCount: missingMonths.length,
    periodStart:    `${sorted[0].periodMonth}/${sorted[0].periodYear}`,
    periodEnd:      `${sorted.at(-1).periodMonth}/${sorted.at(-1).periodYear}`,
  };

  // ── Detalle completo (requiere pago) ─────────────────────────────────────
  const detail = {
    bills: sorted.map(b => ({
      period:      `${String(b.periodMonth).padStart(2,'0')}/${b.periodYear}`,
      emissionDate: b.emissionDate,
      billNumber:  b.billNumber,
      kwhConsumed: b.kwhConsumed,
      totalAmount: b.totalAmount,
      pricePerKwh: b.pricePerKwh,
      isSpike:     spikes.some(s => s.billNumber === b.billNumber),
      hasArithmeticIssue: !!b.arithmeticIssue,
    })),
    missingMonths,
    spikes,
    arithmeticIssues,
    avgMonthlyKwh:  Math.round(totalKwhBilled / sorted.length),
    avgMonthlyAmount: Math.round(
      sorted.reduce((s, b) => s + (b.totalAmount || 0), 0) / sorted.length
    ),
    maxKwhMonth:   sorted.reduce((max, b) => b.kwhConsumed > max.kwhConsumed ? b : max),
    minKwhMonth:   sorted.reduce((min, b) => b.kwhConsumed < min.kwhConsumed ? b : min),
  };

  return { success: true, preview, detail };
}

// ─── Detección de meses faltantes ────────────────────────────────────────────

function detectMissingMonths(sortedBills) {
  if (sortedBills.length < 2) return [];

  const missing = [];
  for (let i = 0; i < sortedBills.length - 1; i++) {
    const current = sortedBills[i];
    const next    = sortedBills[i + 1];

    // Calcular el mes esperado siguiente
    let expectedMonth = current.periodMonth + 1;
    let expectedYear  = current.periodYear;
    if (expectedMonth > 12) { expectedMonth = 1; expectedYear += 1; }

    // Si no coincide con el siguiente, hay un gap
    if (next.periodMonth !== expectedMonth || next.periodYear !== expectedYear) {
      // Recorrer todos los meses faltantes
      let m = expectedMonth;
      let y = expectedYear;
      while (!(m === next.periodMonth && y === next.periodYear)) {
        missing.push({ month: m, year: y, label: `${String(m).padStart(2,'0')}/${y}` });
        m++;
        if (m > 12) { m = 1; y++; }
      }
    }
  }

  return missing;
}

// ─── Detección de picos de consumo ───────────────────────────────────────────

function detectSpikes(sortedBills) {
  if (sortedBills.length < 3) return [];

  const values  = sortedBills.map(b => b.kwhConsumed);
  const mean    = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev  = Math.sqrt(variance);
  const threshold = mean + 1.5 * stdDev;

  return sortedBills
    .filter(b => b.kwhConsumed > threshold)
    .map(b => ({
      period:     `${String(b.periodMonth).padStart(2,'0')}/${b.periodYear}`,
      billNumber: b.billNumber,
      kwhConsumed: b.kwhConsumed,
      kwhAboveAvg: Math.round(b.kwhConsumed - mean),
      percentAbove: Math.round(((b.kwhConsumed - mean) / mean) * 100),
      type:       'consumption_spike',
      severity:   'warning',
      description: `Consumo ${Math.round(((b.kwhConsumed - mean) / mean) * 100)}% sobre el promedio del período`,
    }));
}

// ─── CLI para probar directamente ────────────────────────────────────────────

// Ejecutar solo si se llama directamente: node parser/index.js <archivo.pdf> [kwh_medidor]
if (process.argv[1].endsWith('index.js')) {
  const filePath    = process.argv[2];
  const meterReading = parseFloat(process.argv[3] ?? '0');

  if (!filePath) {
    console.error('Uso: node parser/index.js <archivo.pdf> [lectura_medidor_kwh]');
    process.exit(1);
  }

  const buffer = await readFile(filePath);
  const result = await parseCGEBill(buffer, filePath);

  console.log('\n── BOLETA PARSEADA ──────────────────────────────');
  console.log(JSON.stringify(result, null, 2));

  if (meterReading > 0) {
    const analysis = analyzeBills([result], meterReading);
    console.log('\n── ANÁLISIS ─────────────────────────────────────');
    console.log(JSON.stringify(analysis, null, 2));
  }
}
