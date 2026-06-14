import { useState } from 'react'
import { C, Card, Btn, StepBar } from '../components/ui'

export default function Meter({ onNext }) {
  const [value, setValue] = useState('')

  const parsed = value ? parseInt(value.replace(/\D/g, '')) : null

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 480, margin: '0 auto' }}>
      <StepBar current={1} />

      <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
        Lectura del medidor
      </h2>
      <p style={{ color: C.muted, fontSize: 14, margin: '0 0 28px', lineHeight: 1.65 }}>
        Ve al medidor físico y anota el número del display. Normalmente está en la fachada o en el pasillo de tu edificio.
      </p>

      {/* Display estilo medidor físico */}
      <Card style={{ textAlign: 'center', padding: '28px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          Número que marca el medidor hoy
        </div>

        {/* Pantalla LCD */}
        <div style={{
          background: '#020810',
          border: `2px solid #7A500F`,
          borderRadius: 8, padding: '14px 24px',
          display: 'inline-block', marginBottom: 20, minWidth: 220,
        }}>
          <span style={{
            fontFamily: "ui-monospace,'Courier New',monospace",
            fontSize: 48, fontWeight: 700, lineHeight: 1,
            color: parsed ? '#E8A020' : '#2A1A08',
            letterSpacing: '0.04em',
            textShadow: parsed ? '0 0 20px #E8A02055' : 'none',
          }}>
            {parsed !== null ? parsed.toLocaleString('es-CL') : '— — — — —'}
          </span>
          {parsed !== null && (
            <span style={{ fontFamily: 'monospace', fontSize: 18, color: '#E8A02099', marginLeft: 6, fontWeight: 600 }}>
              kWh
            </span>
          )}
        </div>

        <input
          type="number"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Ej: 4180"
          autoFocus
          style={{
            display: 'block', width: '100%', boxSizing: 'border-box',
            background: C.surf,
            border: `1.5px solid ${value ? C.amber : C.border}`,
            borderRadius: 10, padding: '14px 16px',
            fontSize: 20, fontFamily: "ui-monospace,monospace",
            fontWeight: 700, color: C.text, textAlign: 'center',
            letterSpacing: '0.06em', outline: 'none',
          }}
        />
      </Card>

      <Card style={{ background: C.amberBg, marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: C.amber, fontWeight: 700, marginBottom: 6 }}>
          ¿Dónde encuentro el número?
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          El medidor tiene un display con 5 a 6 dígitos. Anota solo los números enteros sobre fondo blanco — ignora los decimales en rojo si los hay.
        </div>
      </Card>

      <Btn
        fullWidth
        disabled={!parsed || parsed === 0}
        onClick={() => onNext(parsed)}
      >
        Analizar →
      </Btn>
    </div>
  )
}
