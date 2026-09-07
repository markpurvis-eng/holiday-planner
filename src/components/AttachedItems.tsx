import type { Document, Link as LinkType } from '../lib/types'

export function AttachedItems({
  documents,
  links,
}: {
  documents: Document[]
  links: LinkType[]
}) {
  if (documents.length === 0 && links.length === 0) return null

  return (
    <div className="mt-3 space-y-1.5 border-t border-stone-100 pt-3">
      {documents.map((doc) => (
        <a
          key={doc.id}
          href={doc.file_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm text-stone-600 hover:text-teal-700"
        >
          <span>{doc.type === 'photo' ? '📷' : '📄'}</span>
          <span className="truncate">{doc.title ?? 'Document'}</span>
        </a>
      ))}
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm text-stone-600 hover:text-teal-700"
        >
          <span>🔗</span>
          <span className="truncate">{link.label}</span>
        </a>
      ))}
    </div>
  )
}
