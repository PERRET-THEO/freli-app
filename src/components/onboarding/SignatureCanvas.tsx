import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui'

type SignatureCanvasProps = {
  onSave: (dataUrl: string) => Promise<void> | void
  disabled?: boolean
}

export function SignatureCanvas({ onSave, disabled = false }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const inkColor =
      getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#0d0f14'
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 2
    context.strokeStyle = inkColor
  }, [])

  const getPoint = (event: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if ('touches' in event) {
      const touch = event.touches[0]
      if (!touch) return null
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const startDrawing = (event: MouseEvent | TouchEvent) => {
    if (disabled) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const point = getPoint(event)
    if (!canvas || !context || !point) return
    context.beginPath()
    context.moveTo(point.x, point.y)
    setIsDrawing(true)
  }

  const draw = (event: MouseEvent | TouchEvent) => {
    if (!isDrawing || disabled) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const point = getPoint(event)
    if (!canvas || !context || !point) return
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  const stopDrawing = () => setIsDrawing(false)

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
  }

  const handleSave = async () => {
    const canvas = canvasRef.current
    if (!canvas || disabled) return
    const dataUrl = canvas.toDataURL('image/png')
    await onSave(dataUrl)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={700}
        height={220}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] touch-none"
        onMouseDown={(event) => startDrawing(event.nativeEvent)}
        onMouseMove={(event) => draw(event.nativeEvent)}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={(event) => {
          event.preventDefault()
          startDrawing(event.nativeEvent)
        }}
        onTouchMove={(event) => {
          event.preventDefault()
          draw(event.nativeEvent)
        }}
        onTouchEnd={stopDrawing}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={clearCanvas} disabled={disabled}>
          Effacer
        </Button>
        <Button onClick={handleSave} disabled={disabled}>
          Valider la signature
        </Button>
      </div>
    </div>
  )
}
