import { supabase } from './supabaseClient'
import type {
  Booking,
  Document,
  DocumentType,
  Expense,
  ItineraryItem,
  Link,
  Payment,
  Todo,
  Trip,
  TripType,
} from './types'

// --- Trip types ---

export async function getTripTypes(): Promise<TripType[]> {
  const { data, error } = await supabase.from('trip_type').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function createTripType(name: string, icon: string): Promise<TripType> {
  const { data, error } = await supabase
    .from('trip_type')
    .insert({ name, icon })
    .select()
    .single()
  if (error) throw error
  return data
}

// --- Trips ---

export async function getTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trip')
    .select('*, trip_type:trip_type_id(*)')
    .order('start_date', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getTrip(id: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trip')
    .select('*, trip_type:trip_type_id(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createTrip(trip: Partial<Trip>): Promise<Trip> {
  const { data, error } = await supabase.from('trip').insert(trip).select().single()
  if (error) throw error
  return data
}

export async function updateTrip(id: string, updates: Partial<Trip>): Promise<Trip> {
  const { data, error } = await supabase
    .from('trip')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// --- Public itinerary sharing ---

// Uploads/overwrites the shared itinerary PDF at a stable per-trip path, so
// regenerating never changes the public URL a previously-shared link points
// at. upsert:true is required here (unlike uploadDocumentFile's random path)
// because this path is deliberately reused on every regeneration.
export async function uploadItineraryPdf(tripId: string, pdfBlob: Blob): Promise<string> {
  const path = `${tripId}.pdf`
  const { error } = await supabase.storage
    .from('itineraries')
    .upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' })
  if (error) throw error
  const { data } = supabase.storage.from('itineraries').getPublicUrl(path)
  return data.publicUrl
}

// Stable public URL for a trip's shared itinerary PDF. getPublicUrl doesn't
// make a network request, so this is safe to call any time the trip's
// public_itinerary_generated_at is set (i.e. the file is known to exist).
export function getItineraryPdfUrl(tripId: string): string {
  const { data } = supabase.storage.from('itineraries').getPublicUrl(`${tripId}.pdf`)
  return data.publicUrl
}

// --- Bookings ---

export async function getBookings(tripId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('booking')
    .select('*')
    .eq('trip_id', tripId)
    .order('start_date', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createBooking(booking: Partial<Booking>): Promise<Booking> {
  const { data, error } = await supabase.from('booking').insert(booking).select().single()
  if (error) throw error
  return data
}

export async function updateBooking(id: string, updates: Partial<Booking>): Promise<Booking> {
  const { data, error } = await supabase.from('booking').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// --- Payments ---

export async function getPayments(bookingId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payment')
    .select('*')
    .eq('booking_id', bookingId)
    .order('due_date', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createPayment(payment: Partial<Payment>): Promise<Payment> {
  const { data, error } = await supabase.from('payment').insert(payment).select().single()
  if (error) throw error
  return data
}

// --- Itinerary ---

export async function getItinerary(tripId: string): Promise<ItineraryItem[]> {
  const { data, error } = await supabase
    .from('itinerary_item')
    .select('*')
    .eq('trip_id', tripId)
    .order('date', { ascending: true })
    .order('time', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createItineraryItem(item: Partial<ItineraryItem>): Promise<ItineraryItem> {
  const { data, error } = await supabase.from('itinerary_item').insert(item).select().single()
  if (error) throw error
  return data
}

export async function updateItineraryItem(id: string, updates: Partial<ItineraryItem>): Promise<ItineraryItem> {
  const { data, error } = await supabase.from('itinerary_item').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// --- Documents ---

export async function getDocuments(tripId: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from('document')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function uploadDocumentFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('documents').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('documents').getPublicUrl(path)
  return data.publicUrl
}

export async function createDocument(doc: {
  type: DocumentType
  file_url: string
  title?: string | null
  note?: string | null
  trip_id?: string | null
  booking_id?: string | null
  itinerary_item_id?: string | null
  day_date?: string | null
}): Promise<Document> {
  const { data, error } = await supabase.from('document').insert(doc).select().single()
  if (error) throw error
  return data
}

// --- Links ---

export async function getLinks(tripId: string): Promise<Link[]> {
  const { data, error } = await supabase
    .from('link')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createLink(link: {
  url: string
  label: string
  trip_id?: string | null
  booking_id?: string | null
  itinerary_item_id?: string | null
  day_date?: string | null
}): Promise<Link> {
  const { data, error } = await supabase.from('link').insert(link).select().single()
  if (error) throw error
  return data
}

// --- Expenses (ad hoc payments: tips, souvenirs, taxis, etc.) ---
// Distinct from booking/itinerary_item, which represent planned costs.
// An expense is recorded after it's paid, so it has no unpaid/outstanding
// state and no payment_status column - it's simply always paid, with its
// FX rate locked at entry time rather than on a later transition.

export async function getExpenses(tripId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expense')
    .select('*')
    .eq('trip_id', tripId)
    .order('paid_on', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createExpense(expense: {
  trip_id: string
  booking_id?: string | null
  itinerary_item_id?: string | null
  label: string
  amount: number
  currency: string
  paid_on: string
  fx_rate_to_gbp: number
  fx_rate_locked_at: string
}): Promise<Expense> {
  const { data, error } = await supabase.from('expense').insert(expense).select().single()
  if (error) throw error
  return data
}

export async function updateExpense(id: string, updates: Partial<Expense>): Promise<Expense> {
  const { data, error } = await supabase.from('expense').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expense').delete().eq('id', id)
  if (error) throw error
}

// --- Todos ---

export async function getTodos(tripId: string): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todo')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createTodo(tripId: string, text: string): Promise<Todo> {
  const { data, error } = await supabase
    .from('todo')
    .insert({ trip_id: tripId, text, done: false })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function toggleTodo(id: string, done: boolean): Promise<Todo> {
  const { data, error } = await supabase
    .from('todo')
    .update({ done })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
