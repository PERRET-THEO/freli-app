import { useCallback, useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { supabase } from '../../lib/supabase'
import { pdfjs, setupPdfWorker } from '../../lib/pdfWorker'
import { Button } from '../ui'

type Props = {
  contractName: string
  pdfUrl: string | null
  clientName: string
  clientEmail: string
  projectToken: string
  signaturePage?: number
  signatureX?: number
  signatureY?: number
  signatureWidth?: number
  signatureHeight?: number
  onComplete: (signedPdfUrl: string) => void
  onClose: () => void
}

export function SignatureModal({
  contractName,
  pdfUrl,
  clientName,
  clientEmail,
  projectToken,
  signaturePage,
  signatureX,
  signatureY,
  signatureWidth,
  signatureHeight,
  onComplete,
  onClose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewReady, setPreviewReady] = useState(false)

  const sxNorm = signatureX ?? 0.7
  const syNorm = signatureY ?? 0.85
  const swNorm = signatureWidth ?? 0.25
  const shNorm = signatureHeight ?? 0.08

  useEffect(() => {
    if (!pdfUrl) return
    const canvas = previewCanvasRef.current
    if (!canvas) return

    setupPdfWorker()
    let cancelled = false

    const render = async () => {
      try {
        const res = await fetch(pdfUrl)
        const buf = await res.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: buf }).promise
        const pageNum = (signaturePage ?? -1) === -1 ? pdf.numPages : Math.min((signaturePage ?? 0) + 1, pdf.numPages)
        const page = await pdf.getPage(pageNum)

        const baseVp = page.getViewport({ scale: 1 })
        const maxW = 480
        const scale = maxW / baseVp.width
        const vp = page.getViewport({ scale })

        canvas.width = vp.width
        canvas.height = vp.height

        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, viewport: vp }).promise

        if (cancelled) return

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

        setPreviewReady(true)
      } catch {
        /* preview optional */
      }
    }

    render()
    return () => { cancelled = true }
  }, [pdfUrl, signaturePage, sxNorm, syNorm, swNorm, shNorm])

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

      console.log('pdfUrl reçu:', pdfUrl)

      if (pdfUrl) {
        console.log('Chargement du PDF original...')
        const res = await fetch(pdfUrl)
        if (!res.ok) throw new Error('Impossible de télécharger le contrat original.')
        const buf = await res.arrayBuffer()
        console.log('PDF téléchargé, taille:', buf.byteLength)
        pdfDoc = await PDFDocument.load(buf)
        console.log('PDF chargé, pages:', pdfDoc.getPageCount())
      } else {
        console.log('Aucun PDF fourni — génération d\'un contrat vierge')
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

      // CSS coords (origin top-left) → PDF coords (origin bottom-left)
      const sigX = sxNorm * pw
      const sigY = ph - (syNorm * ph) - (shNorm * ph)
      const sigW = swNorm * pw
      const sigH = shNorm * ph

      console.log('Position signature — page:', sigPageIdx, 'x:', sigX, 'y:', sigY, 'w:', sigW, 'h:', sigH)

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

      await supabase.storage.createBucket('contracts', { public: true })

      const filePath = `documents/${projectToken}/signed_contract_${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage
        .from('contracts')
        .upload(filePath, pdfBytes, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw new Error(`Upload échoué : ${upErr.message}`)

      const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(filePath)
      console.log('PDF signé uploadé:', urlData.publicUrl)
      onComplete(urlData.publicUrl)
    } catch (err) {
      console.error('Erreur signature:', err)
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }, [accepted, pdfUrl, contractName, clientName, clientEmail, projectToken, signaturePage, sxNorm, syNorm, swNorm, shNorm, onComplete])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/50 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--white)] shadow-2xl">
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

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {pdfUrl ? (
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
              <embed src={pdfUrl} type="application/pdf" className="h-[300px] w-full" />
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
              <p className="text-3xl">📄</p>
              <p className="mt-2 font-display text-lg font-semibold text-[var(--ink)]">{contractName}</p>
              <p className="mt-1 font-body text-sm text-[var(--ink-muted)]">
                Contrat entre <strong>{clientName}</strong> et l&apos;agence.
              </p>
            </div>
          )}

          {pdfUrl && previewReady && (
            <div className="space-y-1">
              <p className="font-body text-xs font-medium text-[var(--ink-muted)]">Aperçu de l&apos;emplacement de la signature</p>
              <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
                <canvas ref={previewCanvasRef} className="block w-full" style={{ maxHeight: 260 }} />
              </div>
              <p className="text-center font-body text-xs text-[var(--accent)]">Votre signature apparaîtra ici ↑</p>
            </div>
          )}
          {pdfUrl && !previewReady && (
            <canvas ref={previewCanvasRef} className="hidden" />
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
