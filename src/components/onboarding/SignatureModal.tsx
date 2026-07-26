import { useCallback, useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { uploadPortalSignedContract } from '../../lib/contractStorage'
import { pdfjs, setupPdfWorker } from '../../lib/pdfWorker'
import { Button } from '../ui'

type Props = {
  contractName: string
  pdfUrl: string | null
  clientName: string
  clientEmail: string
  projectToken: string
  checklistItemId?: string
  signaturePage?: number
  signatureX?: number
  signatureY?: number
  signatureWidth?: number
  signatureHeight?: number
  onComplete: (signedPdfUrl: string) => void
  onClose: () => void
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 120) || 'contrat'
}

export function SignatureModal({
  contractName,
  pdfUrl,
  clientName,
  clientEmail,
  projectToken,
  checklistItemId,
  signaturePage,
  signatureX,
  signatureY,
  signatureWidth,
  signatureHeight,
  onComplete,
  onClose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pageCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const pdfProxyRef = useRef<PDFDocumentProxy | null>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [fullDocReady, setFullDocReady] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [docActionsBusy, setDocActionsBusy] = useState(false)

  const sxNorm = signatureX ?? 0.7
  const syNorm = signatureY ?? 0.85
  const swNorm = signatureWidth ?? 0.25
  const shNorm = signatureHeight ?? 0.08

  /** Page pdf.js 1-based où apposer la signature (même logique que handleValidate) */
  const signaturePage1Based = (total: number) => {
    if (!total) return 1
    if ((signaturePage ?? -1) === -1) return total
    return Math.min((signaturePage ?? 0) + 1, total)
  }

  useEffect(() => {
    if (!pdfUrl) {
      setNumPages(0)
      setFullDocReady(false)
      setPreviewError(null)
      pdfProxyRef.current = null
      pageCanvasRefs.current = []
      return
    }

    setFullDocReady(false)
    setPreviewError(null)
    setNumPages(0)
    setupPdfWorker()
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(pdfUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = await res.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: buf }).promise
        if (cancelled) return
        pdfProxyRef.current = pdf
        setNumPages(pdf.numPages)
      } catch {
        if (!cancelled) {
          setPreviewError(
            "Le document n'a pas pu être chargé. Vous pouvez utiliser Télécharger / Imprimer si le lien fonctionne, ou signer quand même : le PDF final sera généré côté serveur.",
          )
        }
      }
    }

    void load()
    return () => {
      cancelled = true
      pdfProxyRef.current = null
    }
  }, [pdfUrl])

  useEffect(() => {
    if (!pdfUrl || !numPages || !pdfProxyRef.current) return

    const pdf = pdfProxyRef.current
    const sigPage = signaturePage1Based(numPages)
    let cancelled = false

    const renderAll = async () => {
      setFullDocReady(false)
      const maxW = Math.min(720, typeof window !== 'undefined' ? window.innerWidth - 64 : 720)

      for (let i = 1; i <= numPages; i += 1) {
        if (cancelled) return
        const canvas = pageCanvasRefs.current[i - 1]
        if (!canvas) continue

        const page = await pdf.getPage(i)
        const baseVp = page.getViewport({ scale: 1 })
        const scale = maxW / baseVp.width
        const vp = page.getViewport({ scale })

        canvas.width = vp.width
        canvas.height = vp.height

        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, viewport: vp }).promise

        if (i === sigPage) {
          const rx = sxNorm * canvas.width
          const ry = syNorm * canvas.height
          const rw = swNorm * canvas.width
          const rh = shNorm * canvas.height

          ctx.setLineDash([6, 4])
          ctx.strokeStyle = '#5B6EF5'
          ctx.lineWidth = 2
          ctx.strokeRect(rx, ry, rw, rh)
          ctx.setLineDash([])

          ctx.fillStyle = 'rgba(91, 110, 245, 0.08)'
          ctx.fillRect(rx, ry, rw, rh)

          ctx.fillStyle = '#5B6EF5'
          ctx.font = 'bold 11px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('✍️ Signature ici', rx + rw / 2, ry + rh / 2 + 4)
        }
      }

      if (!cancelled) setFullDocReady(true)
    }

    void renderAll()
    return () => {
      cancelled = true
    }
  }, [pdfUrl, numPages, signaturePage, sxNorm, syNorm, swNorm, shNorm])

  const handleDownloadPdf = useCallback(async () => {
    if (!pdfUrl) return
    setDocActionsBusy(true)
    try {
      const res = await fetch(pdfUrl)
      if (!res.ok) throw new Error('Téléchargement impossible pour le moment.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${sanitizeFilename(contractName)}.pdf`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch {
      setError('Impossible de télécharger le PDF. Réessayez ou ouvrez le lien depuis votre messagerie.')
    } finally {
      setDocActionsBusy(false)
    }
  }, [pdfUrl, contractName])

  const handlePrintPdf = useCallback(async () => {
    if (!pdfUrl) return
    setDocActionsBusy(true)
    try {
      const res = await fetch(pdfUrl)
      if (!res.ok) throw new Error('Impression impossible pour le moment.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = 'none'
      iframe.src = url
      document.body.appendChild(iframe)
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } finally {
          setTimeout(() => {
            document.body.removeChild(iframe)
            URL.revokeObjectURL(url)
          }, 1500)
        }
      }
    } catch {
      setError("Impossible de lancer l'impression. Utilisez Télécharger puis imprimez le fichier.")
    } finally {
      setDocActionsBusy(false)
    }
  }, [pdfUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const pad = new SignaturePad(canvas, {
      penColor: '#000000',
      minWidth: 1.5,
      maxWidth: 2.5,
      backgroundColor: 'rgb(255,255,255)',
    })
    padRef.current = pad
    pad.addEventListener('endStroke', () => setIsEmpty(pad.isEmpty()))

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(ratio, ratio)
      pad.clear()
      setIsEmpty(true)
    }

    resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      pad.off()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const handleClear = useCallback(() => {
    padRef.current?.clear()
    setIsEmpty(true)
  }, [])

  const canValidate = !isEmpty && accepted && !saving

  const handleValidate = useCallback(async () => {
    const pad = padRef.current
    if (!pad || pad.isEmpty() || !accepted) return
    setSaving(true)
    setError(null)

    try {
      const dataUrl = pad.toDataURL('image/png')
      const raw = dataUrl.split(',')[1] ?? ''
      const sigBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
      const now = new Date()
      const dateStr = now.toLocaleDateString('fr-FR')
      const timeStr = now.toLocaleTimeString('fr-FR')

      let pdfDoc: PDFDocument

      if (pdfUrl) {
        const res = await fetch(pdfUrl)
        if (!res.ok) throw new Error('Impossible de télécharger le contrat original.')
        const buf = await res.arrayBuffer()
        pdfDoc = await PDFDocument.load(buf)
      } else {
        pdfDoc = await PDFDocument.create()
        const page = pdfDoc.addPage([595.28, 841.89])
        const hBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
        const hReg = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const { height } = page.getSize()
        let y = height - 60
        page.drawText('CONTRAT DE PRESTATION', { x: 50, y, size: 22, font: hBold, color: rgb(0.12, 0.12, 0.12) })
        y -= 40
        page.drawText(contractName, { x: 50, y, size: 14, font: hReg, color: rgb(0.25, 0.25, 0.25) })
        y -= 35
        page.drawText(`Client : ${clientName}`, { x: 50, y, size: 11, font: hReg, color: rgb(0.3, 0.3, 0.3) })
        y -= 20
        page.drawText(`Email : ${clientEmail}`, { x: 50, y, size: 11, font: hReg, color: rgb(0.3, 0.3, 0.3) })
        y -= 20
        page.drawText(`Date : ${dateStr} à ${timeStr}`, { x: 50, y, size: 11, font: hReg, color: rgb(0.3, 0.3, 0.3) })
      }

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const sigImg = await pdfDoc.embedPng(sigBytes)
      const pages = pdfDoc.getPages()

      const sigPageIdx = (signaturePage ?? -1) === -1
        ? pages.length - 1
        : Math.min(signaturePage ?? 0, pages.length - 1)
      const targetPage = pages[sigPageIdx]
      const { width: pw, height: ph } = targetPage.getSize()

      const sigX = sxNorm * pw
      const sigY = ph - (syNorm * ph) - (shNorm * ph)
      const sigW = swNorm * pw
      const sigH = shNorm * ph

      targetPage.drawImage(sigImg, { x: sigX, y: sigY, width: sigW, height: sigH })

      targetPage.drawText(`Signé par ${clientName} (${clientEmail})`, {
        x: sigX, y: sigY - 12, size: 7, font, color: rgb(0.4, 0.4, 0.4),
      })
      targetPage.drawText(`Le ${dateStr} à ${timeStr}`, {
        x: sigX, y: sigY - 22, size: 7, font, color: rgb(0.4, 0.4, 0.4),
      })
      targetPage.drawText(`Réf. ${projectToken}`, {
        x: sigX, y: sigY - 32, size: 7, font, color: rgb(0.5, 0.5, 0.5),
      })

      const pdfBytes = await pdfDoc.save()

      const signedUrl = await uploadPortalSignedContract(projectToken, pdfBytes, {
        checklistItemId,
        signerName: clientName,
        signerEmail: clientEmail,
      })
      onComplete(signedUrl)
    } catch (err) {
      console.error('Erreur signature:', err)
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }, [accepted, pdfUrl, contractName, clientName, clientEmail, projectToken, checklistItemId, signaturePage, sxNorm, syNorm, swNorm, shNorm, onComplete])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/50 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--white)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="font-display text-xl font-bold text-[var(--ink)]">Signez le document</h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-[var(--ink-muted)] transition hover:bg-[var(--surface-warm)] hover:text-[var(--ink)]"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            {!pdfUrl && (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
                <p className="text-3xl">📄</p>
                <p className="mt-2 font-display text-lg font-semibold text-[var(--ink)]">{contractName}</p>
                <p className="mt-1 font-body text-sm text-[var(--ink-muted)]">
                  Contrat entre <strong>{clientName}</strong> et l&apos;agence.
                </p>
              </div>
            )}

            {pdfUrl && (
              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-body text-sm font-medium text-[var(--ink)]">
                    Document complet ({numPages ? `${numPages} page${numPages > 1 ? 's' : ''}` : '…'})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={docActionsBusy || !numPages}
                      onClick={() => void handleDownloadPdf()}
                      className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-1.5 font-body text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                    >
                      ⬇ Télécharger le PDF
                    </button>
                    <button
                      type="button"
                      disabled={docActionsBusy || !numPages}
                      onClick={() => void handlePrintPdf()}
                      className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-1.5 font-body text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                    >
                      🖨 Imprimer
                    </button>
                  </div>
                </div>
                <p className="font-body text-xs text-[var(--ink-muted)]">
                  Faites défiler pour lire tout le document. La zone de signature à apposer est indiquée sur la page concernée.
                </p>

                {previewError && (
                  <div className="rounded-[var(--radius-md)] border border-[var(--amber)] bg-[var(--amber-soft)] px-3 py-2 font-body text-xs text-[var(--ink)]">
                    {previewError}
                  </div>
                )}

                <div className="relative max-h-[min(70vh,720px)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
                  {!fullDocReady && !previewError && numPages > 0 && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface)]">
                      <p className="font-body text-sm text-[var(--ink-muted)]">Préparation de l&apos;aperçu…</p>
                    </div>
                  )}
                  {!numPages && !previewError && (
                    <div className="flex min-h-[160px] items-center justify-center">
                      <p className="font-body text-sm text-[var(--ink-muted)]">Chargement du document…</p>
                    </div>
                  )}

                  <div className="flex flex-col items-center gap-6 p-4">
                    {numPages > 0 &&
                      Array.from({ length: numPages }, (_, idx) => (
                        <div key={idx} className="w-full max-w-[720px]">
                          <p className="mb-2 font-body text-[11px] font-medium uppercase tracking-wide text-[var(--ink-muted)]">
                            Page {idx + 1} / {numPages}
                          </p>
                          <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] shadow-sm">
                            <canvas
                              ref={(el) => {
                                pageCanvasRefs.current[idx] = el
                              }}
                              className="block h-auto w-full"
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {fullDocReady && (
                  <p className="text-center font-body text-xs text-[var(--accent)]">
                    Votre signature sera apposée dans la zone « Signature ici » sur la page indiquée.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <p className="font-display text-sm font-semibold text-[var(--ink)]">Votre signature</p>
              <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-white">
                <canvas ref={canvasRef} className="block h-40 w-full cursor-crosshair touch-none" />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isEmpty || saving}
                  className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 font-body text-xs font-medium text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
                >
                  Effacer
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  disabled={saving}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border)] accent-[var(--accent)]"
                />
                <span className="font-body text-sm text-[var(--ink)]">
                  J&apos;ai lu et j&apos;accepte le contrat. En signant, je reconnais avoir pris connaissance du
                  document ci-dessus.
                </span>
              </label>
              <p className="font-body text-xs leading-relaxed text-[var(--ink-muted)]">
                Cette signature électronique a valeur contractuelle conformément à l&apos;article 1366 du Code civil
                français.
              </p>
            </div>

            {error && (
              <div className="rounded-[var(--radius-sm)] border border-[var(--amber)] bg-[var(--amber-soft)] p-3">
                <p className="font-body text-sm text-[var(--ink)]">{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleValidate} disabled={!canValidate}>
            {saving ? 'Enregistrement...' : 'Valider la signature →'}
          </Button>
        </div>
      </div>
    </div>
  )
}
