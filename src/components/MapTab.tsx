import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Booking, ItineraryItem } from '../lib/types'
import { buildMapPinItems, daysBetween, groupPins, itemOnDay } from '../lib/mapPins'
import type { MapPinGroup } from '../lib/mapPins'
import { formatDate, formatDayAbbrev, formatTime } from '../lib/format'

type JumpTab = 'bookings' | 'itinerary'

function pinIcon(count: number, selected: boolean): L.DivIcon {
  const bg = selected ? '#b45309' : '#0f766e'
  const label = count > 1 ? String(count) : ''
  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;font:600 13px/24px system-ui,sans-serif;text-align:center;">${label}</div>`,
  })
}

export default function MapTab({
  bookings,
  itinerary,
  tripStart,
  tripEnd,
  onJump,
}: {
  bookings: Booking[]
  itinerary: ItineraryItem[]
  tripStart: string
  tripEnd: string
  onJump: (tab: JumpTab, id: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mapHeight, setMapHeight] = useState(360)

  const allItems = useMemo(() => buildMapPinItems(bookings, itinerary), [bookings, itinerary])
  const visibleItems = useMemo(
    () => (selectedDay ? allItems.filter((item) => itemOnDay(item, selectedDay)) : allItems),
    [allItems, selectedDay]
  )
  const groups = useMemo(() => groupPins(visibleItems), [visibleItems])
  const selectedGroup: MapPinGroup | undefined = groups.find((g) => g.key === selectedKey)

  const daysWithPins = useMemo(
    () => daysBetween(tripStart, tripEnd).filter((day) => allItems.some((item) => itemOnDay(item, day))),
    [allItems, tripStart, tripEnd]
  )

  const hasPins = allItems.length > 0

  // The map is sized to fill whatever is left between its own top edge and
  // the fixed bottom nav, rather than a fixed share of the screen height.
  // A fixed height put the map's bottom edge (and the attribution, and
  // anything below it) behind the nav bar on a phone. The sticky trip
  // header above changes height (collapsing/expanding), so it's watched too.
  useEffect(() => {
    if (!hasPins) return
    function measure() {
      const wrap = wrapRef.current
      if (!wrap) return
      const nav = document.querySelector('nav')
      const navHeight = nav ? nav.getBoundingClientRect().height : 64
      const top = wrap.getBoundingClientRect().top + window.scrollY
      setMapHeight(Math.max(280, Math.round(window.innerHeight - navHeight - top - 12)))
    }
    measure()
    window.addEventListener('resize', measure)
    const header = document.getElementById('trip-sticky-header')
    const observer = header ? new ResizeObserver(measure) : null
    if (header && observer) observer.observe(header)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [hasPins])

  useEffect(() => {
    if (!hasPins || !containerRef.current) return
    const el = containerRef.current
    // Zoom buttons live bottom-right so the selected-item card, which sits
    // over the top of the map, never covers them.
    const map = L.map(el, { zoomControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    map.on('click', () => setSelectedKey(null))
    const sizeObserver = new ResizeObserver(() => map.invalidateSize())
    sizeObserver.observe(el)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    map.setView([20, 0], 2)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const resize = setTimeout(() => map.invalidateSize(), 0)
    return () => {
      clearTimeout(resize)
      sizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [hasPins])

  // Markers are rebuilt whenever the visible set or the selection changes;
  // the view is only refitted when the visible set changes, so tapping a
  // pin doesn't make the map jump around.
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()
    for (const group of groups) {
      L.marker([group.lat, group.lng], { icon: pinIcon(group.items.length, group.key === selectedKey) })
        .on('click', () => setSelectedKey(group.key))
        .addTo(layer)
    }
  }, [groups, selectedKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map || groups.length === 0) return
    if (groups.length === 1) {
      map.setView([groups[0].lat, groups[0].lng], 15)
      return
    }
    map.fitBounds(L.latLngBounds(groups.map((g) => [g.lat, g.lng] as [number, number])), {
      padding: [36, 36],
      maxZoom: 15,
    })
  }, [groups])

  // Nudge the map so the tapped pin isn't hidden under the card that opens
  // over the top of it.
  useEffect(() => {
    const map = mapRef.current
    const group = groups.find((g) => g.key === selectedKey)
    if (!map || !group) return
    const cardHeight = cardRef.current?.offsetHeight ?? 0
    map.panInside([group.lat, group.lng], {
      paddingTopLeft: [24, cardHeight + 24],
      paddingBottomRight: [24, 24],
    })
  }, [selectedKey, groups])

  if (!hasPins) {
    return (
      <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-400 ring-1 ring-stone-100">
        No map pins for this trip yet. Pins appear for bookings and itinerary items that have an
        address and a saved location.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-400">
        {visibleItems.length} pinned {visibleItems.length === 1 ? 'item' : 'items'} at {groups.length}{' '}
        {groups.length === 1 ? 'place' : 'places'}
        {selectedGroup ? '' : ' · tap a pin for details'}
      </p>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={() => {
            setSelectedDay(null)
            setSelectedKey(null)
          }}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            selectedDay === null ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          All days
        </button>
        {daysWithPins.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => {
              setSelectedDay(day)
              setSelectedKey(null)
            }}
            className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
              selectedDay === day ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {formatDayAbbrev(day)} {formatDate(day, { day: 'numeric', month: 'short' })}
          </button>
        ))}
      </div>

      {/* isolate keeps Leaflet's high z-index panes/controls contained, so
          they can't poke through the sticky header or the bottom nav. */}
      <div ref={wrapRef} className="relative isolate">
        <div
          ref={containerRef}
          style={{ height: mapHeight }}
          className="w-full overflow-hidden rounded-2xl ring-1 ring-stone-200"
        />

        {selectedGroup && (
          <div
            ref={cardRef}
            className="absolute inset-x-2 top-2 z-[1100] max-h-[45%] overflow-y-auto rounded-2xl bg-white p-2 shadow-lg ring-1 ring-stone-200"
          >
            <div className="flex items-center justify-between px-1 pb-1">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
                {selectedGroup.items.length} {selectedGroup.items.length === 1 ? 'item' : 'items'} here
              </p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedKey(null)}
                className="px-2 text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5">
              {selectedGroup.items.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => onJump(item.kind === 'booking' ? 'bookings' : 'itinerary', item.id)}
                  className="flex w-full items-center gap-3 rounded-xl bg-stone-50 p-3 text-left hover:bg-teal-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-800">{item.title}</p>
                    <p className="truncate text-xs text-stone-500">
                      {item.startDate ? formatDate(item.startDate, { day: 'numeric', month: 'short' }) : ''}
                      {item.time ? ` ${formatTime(item.time)}` : ''}
                      {item.address ? ` · ${item.address}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-teal-600">View →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
