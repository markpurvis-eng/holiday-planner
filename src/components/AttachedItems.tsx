import type { Document, Link as LinkType } from '../lib/types'
import { LongPressMenu } from './LongPressMenu'

// Missing Features #6: long-press a row to delete it, wherever this
// component renders (Documents/Links tabs' booking/itinerary groups, every
// booking/itinerary card, Costs tab lines). onDelete* are optional so a
// read-only usage (none currently) can still opt out.
export function AttachedItems({
  documents,
  links,
  onDeleteDocument,
  onDeleteLink,
}: {
  documents: Document[]
  links: LinkType[]
  onDeleteDocument?: (doc: Document) => void
  onDeleteLink?: (link: LinkType) => void
}) {
  if (documents.length === 0 && links.length === 0) return null

  return (
    <div className="mt-3 space-y-1.5 border-t border-stone-100 pt-3">
      {documents.map((doc) => {
        const row = (
          <a
            href={doc.file_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-stone-600 hover:text-teal-700"
          >
            <span>{doc.type === 'photo' ? '📷' : '📄'}</span>
            <span className="min-w-0 flex-1 truncate">{doc.title ?? 'Document'}</span>
          </a>
        )
        return onDeleteDocument ? (
          <LongPressMenu
            key={doc.id}
            actions={[
              {
                label: 'Delete',
                destructive: true,
                onSelect: () => onDeleteDocument(doc),
              },
            ]}
          >
            {row}
          </LongPressMenu>
        ) : (
          <div key={doc.id}>{row}</div>
        )
      })}
      {links.map((link) => {
        const row = (
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-stone-600 hover:text-teal-700"
          >
            <span>🔗</span>
            <span className="min-w-0 flex-1 truncate">{link.label}</span>
          </a>
        )
        return onDeleteLink ? (
          <LongPressMenu
            key={link.id}
            actions={[
              {
                label: 'Delete',
                destructive: true,
                onSelect: () => onDeleteLink(link),
              },
            ]}
          >
            {row}
          </LongPressMenu>
        ) : (
          <div key={link.id}>{row}</div>
        )
      })}
    </div>
  )
}
