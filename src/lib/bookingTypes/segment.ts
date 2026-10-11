// What a booking type contributes to the Itinerary timeline in place of the
// generic "booking begins / ends" markers: one entry per journey segment
// (a flight leg, later a train or transfer leg).
export type TimelineSegment = {
  /** Unique across the app: `${booking.id}-${segment key}`. Also the highlight/jump target. */
  id: string
  /** "Flight", "Train", ... */
  kindLabel: string
  /** "LHR → YOW" */
  title: string
  /** "AC889" */
  subtitle: string
  /** "Arrives 17:05" */
  detail: string
  icon: string
  /** IANA timezone of the segment's start (for the home-time label), or null if unknown. */
  tz: string | null
}

export type SegmentEntry = {
  date: string
  time: string | null
  segment: TimelineSegment
}
