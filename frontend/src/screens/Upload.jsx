import { useState, useRef } from 'react'
import { C, Card, Btn, StepBar, Badge, LCDNumber } from '../components/ui'
import { getUploadUrl, uploadToR2 } from '../lib/api'

export default function Upload({ analysisId, token, onNext }) {
  const [files, setFiles]     = useState([])   // { file, name, r2Key, kwh?, period?, status }
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError]     = useState(null)
  const inputRef = useRef()

  const handleFiles = async (incoming) => {
    const pdfs = Array.from(incoming).filter(f => f.name.endsWith('.pdf'))
    if (!pdfs.length) return

    setUploading(true)
    setError(null)

    const results = []
    for (const file of pdfs) {
      try {
        // 1. Obtener URL firmada del Worker
        const { uploadUrl, r2Key } = await getUploadUrl(analysisId, file.name, token)
        // 2. Subir directo a R2
        await uploadToR2(uploadUrl, file)
        results.push({ file, name: file.name, r2Key, status: 'ok' })
      } catch (e) {
        results.push({ file, name: file.name, status: 'error', error: e.message })
      }
    }

    setFiles(prev => [...prev, ...results])
    setUploading(false)
  }

  const removeFile = (i) => setFiles(prev => prev.filter((_, j) => j !== i))

  const totalFiles = files.filter(f => f.status === 'ok')

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 480, margin: '0 auto' }}>
      <StepBar current={0} />

      <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
        Sube tus boletas
      </h2>
      <p style={{ color: C.muted, fontSize: 14, margin: '0 0 24px', lineHeight: 1.65 }}>
        Descarga cada PDF desde{' '}
        <a href="https://sucursalvirtual.cge.cl/detalle-de-boleta" target="_blank" rel="noreferrer"
          style={{ color: C.amber, textDecoration: 'none' }}>
          sucursalvirtual.cge.cl
        </a>{' '}
        y súbelo aquí. Cuantas más subas, más preciso el análisis.
      </p>

      {/* Drop zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        style={{
          border: `2px dashed ${dragging ? C.amber : C.border}`,
          borderRadius: 12, padding: '28px 20px', textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          background: dragging ? C.amberBg : 'transparent',
          transition: 'all 0.2s', marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 10 }}>
          {uploading ? '⏳' : '📄'}
        </div>
        <div style={{ fontWeight: 600, color: C.text, marginBottom: 4, fontSize: 14 }}>
          {uploading ? 'Subiendo...' : 'Arrastra los PDFs aquí'}
        </div>
        <div style={{ color: C.muted, fontSize: 12 }}>
          {uploading ? 'No cierres la pantalla' : 'o toca para seleccionar'}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          hidden
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <div style={{ background: C.redBg, border: `1px solid ${C.red}44`, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: C.red, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Lista de archivos */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {files.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: C.surf, borderRadius: 10, padding: '10px 14px',
              border: `1px solid ${f.status === 'error' ? C.red + '44' : C.border}`,
            }}>
              <span style={{ fontSize: 16, color: f.status === 'error' ? C.red : C.green }}>
                {f.status === 'error' ? '✗' : '✓'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.name}
                </div>
                {f.status === 'error' && (
                  <div style={{ fontSize: 11, color: C.red }}>{f.error}</div>
                )}
              </div>
              <button
                onClick={() => removeFile(i)}
                style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, padding: 4 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Resumen */}
      {totalFiles.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Boletas listas</div>
              <Badge color={C.green} bg={C.greenBg}>{totalFiles.length} PDF{totalFiles.length > 1 ? 's' : ''}</Badge>
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Subidas a Cloudflare R2 ✓
            </div>
          </div>
        </Card>
      )}

      <Btn fullWidth disabled={totalFiles.length === 0 || uploading} onClick={() => onNext(totalFiles)}>
        {uploading ? 'Subiendo...' : 'Continuar →'}
      </Btn>
    </div>
  )
}
