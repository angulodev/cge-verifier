import { C, LCDNumber, Badge, Card, Btn, Divider } from '../components/ui'

export default function Landing({ onStart }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ marginBottom: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>⚡</span>
          <span style={{ fontWeight: 800, fontSize: 18, color: C.text, letterSpacing: '-0.02em' }}>AuditaCGE</span>
        </div>
      </div>

      <h1 style={{ fontSize: 40, fontWeight: 900, color: C.text, lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 18px' }}>
        ¿Te cobran lo<br />
        que <span style={{ color: C.amber }}>consumes?</span>
      </h1>

      <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.65, margin: '0 0 36px', maxWidth: 340 }}>
        Sube tus boletas de CGE, ingresa la lectura de tu medidor y descubrimos si hay diferencia en segundos.
      </p>

      {/* Display de ejemplo */}
      <Card style={{ marginBottom: 36, textAlign: 'center', padding: '24px 20px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
          Ejemplo real
        </div>
        <LCDNumber value={4180} unit="kWh" size="xl" />
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>medidor · vs. 4.248 kWh facturados</div>
        <Divider />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge color={C.red} bg={C.redBg}>68 kWh de diferencia</Badge>
          <Badge color={C.amber} bg={C.amberBg}>~$16.660 CLP</Badge>
        </div>
      </Card>

      <Btn fullWidth onClick={onStart}>Auditar mis boletas</Btn>

      <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: C.muted }}>
        Preview gratuito · Reporte completo{' '}
        <span style={{ color: C.amber, fontWeight: 700 }}>$2.990 CLP</span>
      </div>
    </div>
  )
}
