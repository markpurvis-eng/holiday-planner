import type { PaymentStatus } from '../lib/types'

// Shared paid/partially-paid/unpaid pill, used on both booking cards and
// itinerary item cards so the two stay visually identical.
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        status === 'paid'
          ? 'bg-emerald-100 text-emerald-700'
          : status === 'partially_paid'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  )
}
