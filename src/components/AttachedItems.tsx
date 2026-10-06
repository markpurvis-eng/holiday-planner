import type { Document, Link as LinkType } from '../lib/types'
import { LongPressMenu } from './LongPressMenu'
import { pdfLinkClick } from '../lib/pdfViewer'

// Missing Features #6: long-press a row to delete it, wherever this
// component renders (Documents/Links tabs' booking/itinerary groups, every
// booking/itinerary card, Costs tab lines). onDelete*/onRenameDocument are
// optional so a read-only usage (none currently) can still opt out.
export function AttachedItems({
  documents,
  links,
  onDeleteDocument,
  onRenameDocument,
  onMoveDocument,
  onDeleteLink,
  onMoveLink,
}: {
  documents: Document[]
  links: LinkType[]
  onDeleteDocument?: (doc: Document) => void
  onRenameDocument?: (doc: Document) => void
  onMoveDocument?: (doc: Document) => void
  onDeleteLink?: (link: LinkType) => void
  onMoveLink?: (link: LinkType) => void
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
            onClick={(e) => pdfLinkClick(e, doc.file_url, doc.title ?? 'Document')}
            className="flex items-center gap-2 text-sm text-stone-600 hover:text-teal-700"
          >
            <span>{doc.type === 'photo' ? '📷' : '📄'}</span>
            <span className="min-w-0 flex-1 truncate">{doc.title ?? 'Document'}</span>
          </a>
        )
        const actions = [
          ...(onRenameDocument ? [{ label: 'Rename', onSelect: () => onRenameDocument(doc) }] : []),
          ...(onMoveDocument ? [{ label: 'Move to…', onSelect: () => onMoveDocument(doc) }] : []),
          ...(onDeleteDocument
            ? [{ label: 'Delete', destructive: true, onSelect: () => onDeleteDocument(doc) }]
            : []),
        ]
        return actions.length > 0 ? (
          <LongPressMenu key={doc.id} actions={actions}>
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
        const linkActions = [
          ...(onMoveLink ? [{ label: 'Move to…', onSelect: () => onMoveLink(link) }] : []),
          ...(onDeleteLink ? [{ label: 'Delete', destructive: true, onSelect: () => onDeleteLink(link) }] : []),
        ]
        return linkActions.length > 0 ? (
          <LongPressMenu key={link.id} actions={linkActions}>
            {row}
          </LongPressMenu>
        ) : (
          <div key={link.id}>{row}</div>
        )
      })}
    </div>
  )
}
