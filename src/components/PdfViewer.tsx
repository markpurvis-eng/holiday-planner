import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { OPEN_PDF_EVENT, downloadUrl, type OpenPdfDetail } from '../lib/pdfViewer'

const MAX_CANVAS_PIXELS = 4_000_000

async function loadDocument(url: string) {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs.getDocument({ url })
}

function PdfPage({
  doc,
  pageNumber,
  width,
  ratio,
}: {
  doc: PDFDocumentProxy
  pageNumber: number
  width: number
  ratio: number
}) {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [pageRatio, setPageRatio] = useState(ratio)

  useEffect(() => {
    const el = holder.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '100% 0px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const target = canvas.current
    if (!target) return
    if (!visible) {
      target.width = 0
      target.height = 0
      return
    }
    let cancelled = false
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null
    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      setPageRatio(base.height / base.width)
      const fit = width / base.width
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      let scale = fit * dpr
      const pixels = base.width * scale * base.height * scale
      if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels)
      const viewport = page.getViewport({ scale })
      target.width = Math.floor(viewport.width)
      target.height = Math.floor(viewport.height)
      task = page.render({ canvas: target, viewport })
      task.promise.catch(() => {})
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNumber, width, visible])

  return (
    <div
      ref={holder}
      className="mx-auto mb-2 bg-white shadow"
      style={{ width, height: Math.round(width * pageRatio) }}
    >
      <canvas ref={canvas} className="block h-full w-full" />
    </div>
  )
}

function PdfViewer({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState(false)
  const [width, setWidth] = useState(0)
  const [ratio, setRatio] = useState(1.414)

  useEffect(() => {
    let task: Awaited<ReturnType<typeof loadDocument>> | null = null
    let cancelled = false
    loadDocument(url)
      .then(async (t) => {
        task = t
        if (cancelled) {
          t.destroy()
          return
        }
        const d = await t.promise
        if (cancelled) return
        const first = await d.getPage(1)
        const v = first.getViewport({ scale: 1 })
        setRatio(v.height / v.width)
        setDoc(d)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
      task?.destroy()
    }
  }, [url])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setWidth(Math.floor(el.clientWidth - 16))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-stone-200">
      <div className="flex items-center gap-2 bg-teal-700 px-3 py-2 text-white">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <a
          href={downloadUrl(url, title)}
          rel="noreferrer"
          className="rounded-lg px-2 py-1 text-xs text-teal-50 ring-1 ring-teal-300/50"
        >
          Download
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg bg-white/15 px-3 py-1 text-sm font-semibold"
        >
          Close
        </button>
      </div>
      <div ref={scroller} className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {error && (
          <p className="p-6 text-center text-sm text-stone-600">
            Couldn't load this PDF. Try "Download".
          </p>
        )}
        {!doc && !error && <p className="p-6 text-center text-sm text-stone-500">Loading…</p>}
        {doc &&
          width > 0 &&
          Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i} doc={doc} pageNumber={i + 1} width={width} ratio={ratio} />
          ))}
      </div>
    </div>
  )
}

export function PdfViewerHost() {
  const [open, setOpen] = useState<OpenPdfDetail | null>(null)

  useEffect(() => {
    const onOpen = (e: Event) => {
      history.pushState({ pdfViewer: true }, '')
      setOpen((e as CustomEvent<OpenPdfDetail>).detail)
    }
    const onPop = () => setOpen(null)
    window.addEventListener(OPEN_PDF_EVENT, onOpen)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener(OPEN_PDF_EVENT, onOpen)
      window.removeEventListener('popstate', onPop)
    }
  }, [])

  const close = useCallback(() => {
    if (history.state?.pdfViewer) history.back()
    else setOpen(null)
  }, [])

  if (!open) return null
  return <PdfViewer key={open.url} url={open.url} title={open.title} onClose={close} />
}
