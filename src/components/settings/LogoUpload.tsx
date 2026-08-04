import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_RASTER_BYTES = 2 * 1024 * 1024
const MAX_SVG_BYTES = 512 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const SVG_DANGER_RE = /<script|onload\s*=|onerror\s*=|javascript:/i

type LogoUploadProps = {
  currentUrl: string | null
  file: File | null
  onFileChange: (file: File | null) => void
  onError: (message: string | null) => void
}

async function assertSvgSafe(file: File): Promise<string | null> {
  const text = await file.text()
  if (SVG_DANGER_RE.test(text)) {
    return 'Ce SVG contient des éléments non autorisés.'
  }
  return null
}

export function LogoUpload({ currentUrl, file, onFileChange, onError }: LogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const validateAndSet = useCallback(
    (next: File | null) => {
      if (!next) {
        onFileChange(null)
        onError(null)
        return
      }

      const isSvg =
        next.type === 'image/svg+xml' || next.name.toLowerCase().endsWith('.svg')

      if (!ACCEPTED_TYPES.includes(next.type) && !isSvg) {
        onError('Format accepté : PNG, JPG, WebP ou SVG.')
        return
      }

      if (isSvg) {
        if (next.size > MAX_SVG_BYTES) {
          onError('SVG trop volumineux (max 512 Ko).')
          return
        }
        void assertSvgSafe(next).then((err) => {
          if (err) {
            onError(err)
            return
          }
          onError(null)
          onFileChange(next)
        })
        return
      }

      if (next.size > MAX_RASTER_BYTES) {
        onError('Logo trop volumineux (max 2 Mo).')
        return
      }
      onError(null)
      onFileChange(next)
    },
    [onError, onFileChange],
  )

  const displayUrl = previewUrl ?? currentUrl

  return (
    <div className="space-y-2">
      <p className="text-sm font-body font-medium text-[var(--ink-soft)]">Logo de l&apos;agence</p>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          validateAndSet(e.dataTransfer.files?.[0] ?? null)
        }}
        className={`flex min-w-0 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed px-4 py-8 text-center transition sm:px-6 ${
          dragOver
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : 'border-[var(--border)] bg-[var(--surface-warm)] hover:border-[var(--accent)]'
        }`}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt="Aperçu du logo"
            className="h-20 w-20 rounded-[var(--radius-sm)] border border-[var(--border)] object-contain bg-[var(--white)] p-1"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--white)] text-3xl">
            🏢
          </div>
        )}
        <p className="mt-3 max-w-full break-words text-sm font-body font-medium text-[var(--ink)]">
          {file ? file.name : 'Glissez une image ou cliquez pour parcourir'}
        </p>
        <p className="mt-1 max-w-full break-words text-xs font-body text-[var(--ink-muted)]">
          SVG recommandé pour un logo net sur tous les écrans ; PNG/WebP aussi acceptés (max 2 Mo /
          512 Ko SVG).
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
        className="sr-only"
        onChange={(e) => validateAndSet(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <button
          type="button"
          onClick={() => {
            onFileChange(null)
            onError(null)
            if (inputRef.current) inputRef.current.value = ''
          }}
          className="text-xs font-body text-[var(--ink-muted)] underline hover:text-[var(--ink)]"
        >
          Retirer la sélection
        </button>
      ) : null}
    </div>
  )
}
