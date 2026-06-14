// ─── Tokens ───────────────────────────────────────────────────────────────────
export const C = {
  bg:       '#080F1E',
  surf:     '#0F1E38',
  card:     '#152237',
  border:   '#1E3A5C',
  amber:    '#E8A020',
  amberDim: '#7A500F',
  amberBg:  'rgba(232,160,32,0.10)',
  text:     '#EEE8D8',
  muted:    '#6B8FAD',
  dim:      '#1E3A5C',
  green:    '#27AE60',
  greenBg:  'rgba(39,174,96,0.12)',
  red:      '#C0392B',
  redBg:    'rgba(192,57,43,0.12)',
}

// ─── LCDNumber ────────────────────────────────────────────────────────────────
export function LCDNumber({ value, unit, size = 'lg', color = C.amber }) {
  const fs = size === 'xl' ? 52 : size === 'lg' ? 36 : 22
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{
        fontFamily: "ui-monospace,'Courier New',monospace",
        fontSize: fs, fontWeight: 700, color,
        letterSpacing: '-0.02em', lineHeight: 1,
        textShadow: `0 0 18px ${color}44`,
      }}>
        {typeof value === 'number' ? value.toLocaleString('es-CL') : value}
      </span>
      {unit && (
        <span style={{ fontFamily: 'monospace', fontSize: fs * 0.38, color: color + '99', fontWeight: 600 }}>
          {unit}
        </span>
      )}
    </span>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ color, bg, children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      background: bg, color, border: `1px solid ${color}44`,
    }}>
      {children}
    </span>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, accent, style = {} }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${accent ? accent + '44' : C.border}`,
      borderLeft: accent ? `3px solid ${accent}` : undefined,
      borderRadius: 12, padding: '16px 20px', ...style,
    }}>
      {children}
    </div>
  )
}

// ─── Btn ─────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = 'primary', disabled, fullWidth, small, type = 'button' }) {
  const base = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    border: 'none', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700, letterSpacing: '0.02em', transition: 'opacity 0.15s',
    width: fullWidth ? '100%' : 'auto',
    padding: small ? '8px 16px' : '14px 24px',
    fontSize: small ? 13 : 15, opacity: disabled ? 0.5 : 1,
  }
  const styles = {
    primary: { ...base, background: C.amber,       color: '#080F1E' },
    outline:  { ...base, background: 'transparent', color: C.amber,  border: `1.5px solid ${C.amber}` },
    ghost:    { ...base, background: 'transparent', color: C.muted,  border: `1px solid ${C.border}` },
    google:   { ...base, background: C.surf,        color: C.text,   border: `1px solid ${C.border}` },
    danger:   { ...base, background: C.red,         color: '#fff' },
  }
  return (
    <button type={type} style={styles[variant]} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ─── StepBar ─────────────────────────────────────────────────────────────────
export function StepBar({ current, total = 4 }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          height: 4, borderRadius: 2, flex: i <= current ? 2 : 1,
          background: i <= current ? C.amber : C.border,
          transition: 'all 0.3s',
        }} />
      ))}
    </div>
  )
}

// ─── Divider ─────────────────────────────────────────────────────────────────
export function Divider() {
  return <div style={{ height: 1, background: C.border, margin: '14px 0' }} />
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div style={{
      width: 18, height: 18, border: `2px solid ${C.amberDim}`,
      borderTop: `2px solid ${C.amber}`, borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}
