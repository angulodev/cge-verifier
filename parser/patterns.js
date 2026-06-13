/**
 * Patrones regex para boletas CGE
 * Formato: DetalleFacturacion - Decreto VAD 11T/2016
 * Fuente de verdad: texto extraído con pdftotext (PDF con text layer)
 */

export const PATTERNS = {
  // Identificación del cliente
  clientNumber:   /N[ºo°]\s*Cliente:\s*(\d+)/i,
  clientAddress:  /Direcci[oó]n del Cliente:\s*(.+)/i,

  // Identificación de la boleta
  billNumber:     /Ref\.\s*Boleta\/Fatura\s*N[ºo°]:\s*(\d+)/i,
  emissionDate:   /Fecha\s*Emisi[oó]n\s*de\s*Facturaci[oó]n:\s*(\d{2}-\d{2}-\d{4})/i,

  // kWh — fuente de verdad: "Cargo energía (334 kWh)"
  // También aparece en "Cargo compra potencia bt1" y "Cargo pot.base distribución"
  // pero usamos energía como canónico
  kwhConsumed:    /Cargo\s+energ[ií]a\s*\((\d+(?:[.,]\d+)?)\s*kWh\)/i,
  // Fallback: cualquier línea con kWh si el patrón anterior falla
  kwhFallback:    /\((\d+(?:[.,]\d+)?)\s*kWh\)/i,

  // Montos
  totalBoleta:    /Total\s+Boleta:\s*\$?\s*([\d.,]+)/i,
  totalPagar:     /TOTAL\s+A\s+PAGAR:\s*\$?\s*([\d.,]+)/i,

  // Cargos individuales (para validación aritmética)
  adminServicio:  /Administraci[oó]n del servicio\s*\$?\s*([\d.,]+)/i,
  transporte:     /Transporte de electricidad\s*\$?\s*([\d.,]+)/i,
  cargoPublico:   /Cargo servicio p[uú]blico\s*\$?\s*([\d.,]+)/i,
  cargoPotencia:  /Cargo compra potencia bt1[^$]*\$?\s*([\d.,]+)/i,
  cargoBase:      /Cargo pot\.base distribuci[oó]n[^$]*\$?\s*([\d.,]+)/i,
  cargoEnergia:   /Cargo energ[ií]a[^$]*\$?\s*([\d.,]+)/i,
  ajusteAnterior: /Ajuste[^\n]*mes anterior\s*\$?\s*(-?[\d.,]+)/i,
  ajusteActual:   /Ajuste[^\n]*mes actual\s*\$?\s*(-?[\d.,]+)/i,
  otros:          /^Otros:\s*\$?\s*([\d.,]+)/im,
};
