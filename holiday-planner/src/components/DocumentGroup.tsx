import type { Document, DocumentType } from '../lib/types'

const LABELS: Record<DocumentType, string> = {
  confirmation: 'Confirmations',
  photo: 'Photos',
  receipt: 'Receipts',
  guide: 'Guides',
}

export function DocumentGroup({ type, documents }: { type: DocumentType; documents: Document[] }) {
  if (documents.length === 0) return null

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-stone-600">
        {LABELS[type]} ({documents.length})
      </h4>
      <div className="grid grid-cols-3 gap-2">
        {documents.map((doc) => (
          <a
            key={doc.id}
            href={doc.file_url}
            target="_blank"
            rel="noreferrer"
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl bg-white p-2 text-center ring-1 ring-stone-100 hover:shadow-md"
          >
            {type === 'photo' ? (
              <img
                src={doc.file_url}
                alt={doc.title ?? 'photo'}
                className="h-full w-full rounded-lg object-cover"
              />
            ) : (
              <>
                <span className="text-2xl">📄</span>
                <span className="line-clamp-2 text-xs text-stone-500">
                  {doc.title ?? 'Document'}
                </span>
              </>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}
