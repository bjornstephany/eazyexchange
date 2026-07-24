import type { AppRow } from '@/lib/dashboard/rollup'

export type TabKey = 'all' | 'invited' | 'toreview' | 'awaiting' | 'accepted' | 'rejected' | 'declined'

export const TAB_KEYS: TabKey[] = ['all', 'invited', 'toreview', 'awaiting', 'accepted', 'rejected', 'declined']

// `?tab=` is a user-editable URL segment: anything unknown falls back to the
// default tab rather than rendering a grid that silently matches nothing.
export function parseTab(raw: string | undefined): TabKey {
  return TAB_KEYS.includes(raw as TabKey) ? (raw as TabKey) : 'all'
}

// Every status belongs to exactly one non-"all" tab. "rejected" is the
// organizer saying no; "declined" is the student saying no — conflating them
// (as the old REJECTED_STATUSES did) made a student who dropped out look
// refused. "awaiting" is organizer-accepted with no student reply yet;
// "accepted" means the student confirmed.
export function matchesTab(a: AppRow, key: TabKey): boolean {
  switch (key) {
    case 'all': return true
    case 'invited': return a.status === 'invited' || a.status === 'draft'
    case 'toreview': return a.status === 'submitted'
    case 'awaiting': return a.status === 'accepted' || a.status === 'maybe'
    case 'accepted': return a.status === 'enrolling' || a.status === 'enrolled'
    case 'rejected': return a.status === 'rejected'
    case 'declined': return a.status === 'declined'
  }
}
