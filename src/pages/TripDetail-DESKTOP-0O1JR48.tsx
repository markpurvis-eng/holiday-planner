import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getTrip,
  getBookings,
  getItinerary,
  getDocuments,
  getLinks,
  getTodos,
  createTodo,
  toggleTodo,
} from '../lib/api'
import type { Booking, Document, ItineraryItem, Link as LinkType, Todo, Trip } from '../lib/types'
import { TabBar } from '../components/TabBar'
import { DocumentGroup } from '../components/DocumentGroup'
import { AttachedItems } from '../components/AttachedItems'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { formatMoney } from '../lib/format'

type Tab = 'bookings' | 'itinerary' | 'documents' | 'links' | 'todos'

export default function TripDetail() {
  const { id } = useParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [itinerary, setItinerary] = useState<ItineraryItem[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [links, setLinks] = useState<LinkType[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('bookings')
  const [newTodo, setNewTodo] = useState('')

  useEffect(() => {
    if (!id) return
    Promise.all([
      getTrip(id),
      getBookings(id),
      getItinerary(id),
      getDocuments(id),
      getLinks(id),
      getTodos(id),
    ])
      .then(([t, b, i, d, l, td]) => {
        setTrip(t)
        setBookings(b)
        setItinerary(i)
        setDocuments(d)
        setLinks(l)
        setTodos(td)
      })
      .finally(() => setLoading(false))
  }, [id])

  async function handleAddTodo(e: FormEvent) {
    e.preventDefault()
    if (!id || !newTodo.trim()) return
    const todo = await createTodo(id, newTodo.trim())
    setTodos((prev) => [...prev, todo])
    setNewTodo('')
  }

  async function handleToggleTodo(todo: Todo) {
    const updated = await toggleTodo(todo.id, !todo.done)
    setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }

  if (loading) return <LoadingSpinner label="Loading trip…" />
  if (!trip) return <p className="p-6 text-center text-stone-500">Trip not found.</p>

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <Link to="/" className="mb-4 inline-block text-sm text-teal-700">
        ← Back to trips
      </Link>

      <div className="mb-6 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-3xl">
          {trip.trip_type?.icon ?? '🧳'}
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-800">{trip.name}</h1>
          <p className="text-sm text-stone-500">
            {new Date(trip.start_date).toLocaleDateString()} –{' '}
            {new Date(trip.end_date).toLocaleDateString()}
            {trip.nights ? ` · ${trip.nights} nights` : ''}
          </p>
        </div>
      </div>

      <TabBar<Tab>
        tabs={[
          { id: 'bookings', label: 'Bookings' },
          { id: 'itinerary', label: 'Itinerary' },
          { id: 'documents', label: 'Documents' },
          { id: 'links', label: 'Links' },
          { id: 'todos', label: 'To-dos' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-4 space-y-4">
        {tab === 'bookings' && (
          <>
            {bookings.length === 0 && <EmptyState text="No bookings yet." />}
            {bookings.map((b) => (
              <div key={b.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-stone-800">{b.provider_name}</h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      b.payment_status === 'paid'
                        ? 'bg-emerald-100 text-emerald-700'
                        : b.payment_status === 'partially_paid'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {b.payment_status.replace('_', ' ')}
                  </span>
                </div>
                {b.confirmation_ref && (
                  <p className="mt-1 text-sm text-stone-500">Ref: {b.confirmation_ref}</p>
                )}
                {(b.start_date || b.end_date) && (
                  <p className="text-sm text-stone-500">
                    {b.start_date ? new Date(b.start_date).toLocaleDateString() : ''}
                    {b.end_date ? ` – ${new Date(b.end_date).toLocaleDateString()}` : ''}
                  </p>
                )}
                {b.cost != null && (
                  <p className="text-sm text-stone-500">{formatMoney(b.cost, b.currency)}</p>
                )}
                {b.check_in_details && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">
                    {b.check_in_details}
                  </p>
                )}
                <AttachedItems
                  documents={documents.filter((d) => d.booking_id === b.id)}
                  links={links.filter((l) => l.booking_id === b.id)}
                />
              </div>
            ))}
          </>
        )}

        {tab === 'itinerary' && (
          <>
            {itinerary.length === 0 && <EmptyState text="No itinerary items yet." />}
            {itinerary.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100"
              >
                <div className="w-16 shrink-0 text-sm text-stone-500">
                  <div>{new Date(item.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div>
                  {item.time && <div>{item.time}</div>}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-teal-600">
                    {item.type}
                  </p>
                  <p className="font-medium text-stone-800">{item.venue}</p>
                  {item.reference && (
                    <p className="text-sm text-stone-500">Ref: {item.reference}</p>
                  )}
                  {item.cost != null && (
                    <p className="text-sm text-stone-500">{formatMoney(item.cost)}</p>
                  )}
                  <AttachedItems
                    documents={documents.filter((d) => d.itinerary_item_id === item.id)}
                    links={links.filter((l) => l.itinerary_item_id === item.id)}
                  />
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'documents' && (
          <>
            {documents.length === 0 && <EmptyState text="No documents yet." />}
            <div className="space-y-5">
              <DocumentGroup type="confirmation" documents={documents.filter((d) => d.type === 'confirmation')} />
              <DocumentGroup type="photo" documents={documents.filter((d) => d.type === 'photo')} />
              <DocumentGroup type="receipt" documents={documents.filter((d) => d.type === 'receipt')} />
              <DocumentGroup type="guide" documents={documents.filter((d) => d.type === 'guide')} />
            </div>
          </>
        )}

        {tab === 'links' && (
          <>
            {links.length === 0 && <EmptyState text="No links yet." />}
            {links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 hover:shadow-md"
              >
                <span className="text-xl">🔗</span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-800">{link.label}</p>
                  <p className="truncate text-sm text-stone-500">{link.url}</p>
                </div>
              </a>
            ))}
          </>
        )}

        {tab === 'todos' && (
          <>
            <form onSubmit={handleAddTodo} className="flex gap-2">
              <input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="Add a to-do…"
                className="flex-1 rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
              <button
                type="submit"
                className="rounded-xl bg-teal-600 px-4 font-medium text-white hover:bg-teal-700"
              >
                Add
              </button>
            </form>
            {todos.length === 0 && <EmptyState text="No to-dos yet." />}
            <div className="space-y-2">
              {todos.map((todo) => (
                <label
                  key={todo.id}
                  className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-100"
                >
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => handleToggleTodo(todo)}
                    className="h-5 w-5 rounded border-stone-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className={todo.done ? 'text-stone-400 line-through' : 'text-stone-700'}>
                    {todo.text}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-400 ring-1 ring-stone-100">
      {text}
    </p>
  )
}
