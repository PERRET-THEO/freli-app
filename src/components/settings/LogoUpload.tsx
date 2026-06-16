import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_BYTES = 2 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

type LogoUploadProps = {
  currentUrl: string | null
  file: File | null
  onFileChange: (file: File | null) => void
  onError: (message: string | null) => void
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
      if (!ACCEPTED_TYPES.includes(next.type)) {
        onError('Format accepté : PNG, JPG ou WebP.')
        return
      }
      if (next.size > MAX_BYTES) {
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
        className={`flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed px-6 py-8 transition ${
          dragOver
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : 'border-[var(--border)] bg-[var(--surface-warm)] hover:border-[var(--accent)]'
        }`}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt="Aperçu du logo"
            className="h-20 w-20 rounded-[var(--radius-sm)] border border-[var(--border)] object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--white)] text-3xl">
            🏢
          </div>
        )}
        <p className="mt-3 text-sm font-body font-medium text-[var(--ink)]">
          {file ? file.name : 'Glissez une image ou cliquez pour parcourir'}
        </p>
        <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">PNG, JPG, WebP — max 2 Mo</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
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
