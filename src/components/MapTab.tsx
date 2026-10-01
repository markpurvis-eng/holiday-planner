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
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

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

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true })
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
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

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

  if (allItems.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-400 ring-1 ring-stone-100">
        No map pins for this trip yet. Pins appear for bookings and itinerary items that have an
        address and a saved location.
      </p>
    )
  }

  return (
    <div className="space-y-3">
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

      <div
        ref={containerRef}
        className="h-[52vh] min-h-[300px] w-full overflow-hidden rounded-2xl ring-1 ring-stone-200"
      />

      <p className="text-xs text-stone-400">
        {visibleItems.length} pinned {visibleItems.length === 1 ? 'item' : 'items'} at {groups.length}{' '}
        {groups.length === 1 ? 'place' : 'places'}
        {selectedGroup ? '' : ' · tap a pin for details'}
      </p>

      {selectedGroup && (
        <div className="space-y-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
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
      )}
    </div>
  )
}
