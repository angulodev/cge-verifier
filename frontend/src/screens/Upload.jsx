import { useState, useRef } from 'react'
import { C, Card, Btn, StepBar, Badge } from '../components/ui'

export default function Upload({ onNext }) {
  const [files,    setFiles]    = useState([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const addFiles = (incoming) => {
    const pdfs = Array.from(incoming).filter(f => f.name.endsWith('.pdf'))
    if (!pdfs.length) return
    // Evitar duplicados por nombre
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...pdfs.filter(f => !names.has(f.name))]
    })
  }

  const remove = (i) => setFiles(prev => prev.filter((_, j) => j !== i))

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 480, margin: '0 auto' }}>
      <StepBar current={0} />

      <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
        Sube tus boletas
      </h2>
      <p style={{ color: C.muted, fontSize: 14, margin: '0 0 24px', lineHeight: 1.65 }}>
        Descarga cada PDF desde{' '}
        <a href="https://sucursalvirtual.cge.cl/detalle-de-boleta" target="_blank" rel="noreferrer"
          style={{ color: C.amber }}>
          sucursalvirtual.cge.cl
        </a>{' '}
        y súbelo aquí. Los archivos se procesan en el momento y no se almacenan.
      </p>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
        style={{
          border: `2px dashed ${dragging ? C.amber : C.border}`,
          borderRadius: 12, padding: '28px 20px', textAlign: 'center',
          cursor: 'pointer', background: dragging ? C.amberBg : 'transparent',
          transition: 'all 0.2s', marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
        <div style={{ fontWeight: 600, color: C.text, marginBottom: 4, fontSize: 14 }}>
          Arrastra los PDFs aquí
        </div>
        <div style={{ color: C.muted, fontSize: 12 }}>o toca para seleccionar</div>
        <input ref={inputRef} type="file" accept=".pdf" multiple hidden onChange={e => addFiles(e.target.files)} />
      </div>

      {/* Lista */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {files.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: C.surf, borderRadius: 10, padding: '10px 14px',
              border: `1px solid ${C.border}`,
            }}>
              <span style={{ fontSize: 14, color: C.green }}>✓</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.name}
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{(f.size / 1024).toFixed(0)} KB</div>
              </div>
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, padding: 4 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: C.muted }}>Listas para analizar</div>
            <Badge color={C.green} bg={C.greenBg}>{files.length} boleta{files.length > 1 ? 's' : ''}</Badge>
          </div>
        </Card>
      )}

      <Btn fullWidth disabled={!files.length} onClick={() => onNext(files)}>
        Continuar →
      </Btn>
    </div>
  )
}
