import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let initialized = false
export function setupPdfWorker() {
  if (initialized) return
  initialized = true
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
}

export { pdfjs }
