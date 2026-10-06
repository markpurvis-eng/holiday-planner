export const OPEN_PDF_EVENT = 'open-pdf'

export interface OpenPdfDetail {
  url: string
  title: string
}

export function isPdfUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /\.pdf$/i.test(url.split(/[?#]/)[0])
}

export function openPdf(url: string, title: string) {
  window.dispatchEvent(new CustomEvent<OpenPdfDetail>(OPEN_PDF_EVENT, { detail: { url, title } }))
}

export function pdfLinkClick(e: { preventDefault: () => void }, url: string, title: string) {
  if (!isPdfUrl(url)) return
  e.preventDefault()
  openPdf(url, title)
}

export function downloadUrl(url: string, title: string): string {
  const name = /\.pdf$/i.test(title) ? title : `${title}.pdf`
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}`
}
