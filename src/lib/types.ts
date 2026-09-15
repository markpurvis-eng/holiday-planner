export type TripType = {
  id: string
  name: string
  icon: string
  created_at: string
}

export type TripStatus = 'upcoming' | 'active' | 'past' | 'cancelled'

export type Trip = {
  id: string
  name: string
  start_date: string
  end_date: string
  nights: number | null
  status: TripStatus
  trip_type_id: string | null
  created_at: string
  trip_type?: TripType | null
  destination_name: string | null
  destination_lat: number | null
  destination_lng: number | null
  public_itinerary_generated_at: string | null
}

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid'

export type Booking = {
  id: string
  trip_id: string
  provider_name: string
  confirmation_ref: string | null
  start_date: string | null
  end_date: string | null
  cost: number | null
  currency: string | null
  payment_status: PaymentStatus
  check_in_details: string | null
  cancelled: boolean
  created_at: string
  destination_name: string | null
  destination_lat: number | null
  destination_lng: number | null
}

export type Payment = {
  id: string
  booking_id: string
  amount: number
  due_date: string | null
  card_used: string | null
  paid: boolean
  created_at: string
}

export type ItineraryItem = {
  id: string
  trip_id: string
  type: string
  date: string
  time: string | null
  venue: string | null
  reference: string | null
  status: string | null
  cancelled: boolean
  cost: number | null
  currency: string | null
  payment_status: PaymentStatus
  created_at: string
  destination_name: string | null
  destination_lat: number | null
  destination_lng: number | null
}

export type DocumentType = 'confirmation' | 'photo' | 'receipt' | 'guide'

export type Document = {
  id: string
  type: DocumentType
  file_url: string
  title: string | null
  note: string | null
  trip_id: string | null
  booking_id: string | null
  itinerary_item_id: string | null
  day_date: string | null
  created_at: string
}

export type Link = {
  id: string
  url: string
  label: string
  trip_id: string | null
  booking_id: string | null
  itinerary_item_id: string | null
  day_date: string | null
  created_at: string
}

export type Todo = {
  id: string
  trip_id: string
  text: string
  done: boolean
  created_at: string
}