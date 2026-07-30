'use client'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { GripVerticalIcon } from 'lucide-react'
import { setActiveExchange, setExchangeOrder } from '@/actions/session'
import { reorderIds } from '@/lib/shell/exchange-order'
import { exchangeDotColor } from '@/lib/shell/exchange-color'
import { cn } from '@/lib/utils'
import type { ExchangeOption } from './OrganizerShell'

// The clickable exchange row itself. Shared by both the collapsed rail and the
// sortable expanded list so the two can never drift apart.
function RowButton({
  ex,
  activeId,
  collapsed,
  onSelect,
}: {
  ex: ExchangeOption
  activeId: string | null
  collapsed: boolean
  onSelect: (id: string) => void
}) {
  const t = useTranslations('organizer')
  return (
    <button
      type="button"
      onClick={() => onSelect(ex.id)}
      title={collapsed ? ex.name : undefined}
      aria-label={collapsed ? ex.name : undefined}
      aria-current={ex.id === activeId ? 'true' : undefined}
      className={cn(
        'flex items-center rounded-[10px] text-[13px]',
        collapsed ? 'h-10 w-10 justify-center' : 'min-w-0 flex-1 gap-2.5 px-3 py-2 text-left',
        ex.id === activeId
          ? 'bg-subtle font-semibold text-foreground'
          : 'text-muted-foreground hover:bg-hoverrow hover:text-foreground',
      )}
    >
      <span
        aria-hidden
        className="h-[9px] w-[9px] flex-none rounded-full"
        style={{ background: exchangeDotColor(ex.id) }}
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{ex.name}</span>}
      {!collapsed && ex.archived && (
        <span className="flex-none rounded-pill bg-subtle px-2 py-px font-mono text-[10px] font-semibold text-muted-foreground">
          {t('shell.archivedBadge')}
        </span>
      )}
    </button>
  )
}

// One draggable row: the select button plus a sibling grip. The grip — NOT the
// row button — carries dnd-kit's listeners: the keyboard sensor lifts on Space,
// which is also how a <button> fires, so putting both on one element makes
// reordering and exchange-selection fight each other.
function SortableExchangeRow({
  ex,
  activeId,
  onSelect,
}: {
  ex: ExchangeOption
  activeId: string | null
  onSelect: (id: string) => void
}) {
  const t = useTranslations('organizer')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ex.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        // Both axes are honoured here; the DndContext modifiers below are what
        // bound the drag (vertical only, and never outside the rows' container).
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      className={cn('group flex items-center gap-0.5', isDragging && 'relative z-10 opacity-80')}
    >
      <RowButton ex={ex} activeId={activeId} collapsed={false} onSelect={onSelect} />
      <button
        type="button"
        aria-label={t('shell.exchangeGroup.reorder', { name: ex.name })}
        className="flex h-7 w-5 flex-none cursor-grab touch-none items-center justify-center rounded-[6px] text-tertiary opacity-0 transition-opacity hover:bg-hoverrow hover:text-muted-foreground focus-visible:opacity-100 group-hover:opacity-100"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon aria-hidden size={14} strokeWidth={1.75} />
      </button>
    </div>
  )
}

export function ExchangeList({
  exchanges,
  activeId,
  collapsed,
  onNewExchange,
}: {
  exchanges: ExchangeOption[]
  activeId: string | null
  collapsed: boolean
  onNewExchange: () => void
}) {
  const t = useTranslations('organizer')
  const router = useRouter()
  const pathname = usePathname()

  // Local mirror of the server-supplied order so a dropped row stays put the
  // instant it lands; persistence is fire-and-forget. Resynced whenever the
  // server sends a different id list (new exchange, deletion, another device).
  const [order, setOrder] = useState<string[]>(() => exchanges.map((e) => e.id))
  const orderKey = exchanges.map((e) => e.id).join(',')
  useEffect(() => {
    setOrder(exchanges.map((e) => e.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey])

  const rows = useMemo(() => {
    const byId = new Map(exchanges.map((e) => [e.id, e]))
    const ordered = order
      .map((id) => byId.get(id))
      .filter((e): e is ExchangeOption => e !== undefined)
    // Anything the server sent that local state has not caught up with yet
    // still renders, at the top — same rule as the server-side sort.
    const seen = new Set(ordered.map((e) => e.id))
    return [...exchanges.filter((e) => !seen.has(e.id)), ...ordered]
  }, [exchanges, order])

  const sensors = useSensors(
    // 5 px of travel is what separates "I clicked this exchange" from "I am
    // dragging it" — below that the row still selects normally.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const announcements = useMemo<Announcements>(() => {
    const nameOf = (id: string | number) => exchanges.find((e) => e.id === String(id))?.name ?? ''
    const positionOf = (id: string | number) => order.indexOf(String(id)) + 1
    const total = order.length
    return {
      onDragStart: ({ active }) =>
        t('shell.exchangeGroup.dnd.picked', { name: nameOf(active.id) }),
      onDragOver: ({ active, over }) =>
        over
          ? t('shell.exchangeGroup.dnd.moved', {
              name: nameOf(active.id),
              position: positionOf(over.id),
              total,
            })
          : undefined,
      onDragEnd: ({ active, over }) =>
        over
          ? t('shell.exchangeGroup.dnd.dropped', {
              name: nameOf(active.id),
              position: positionOf(over.id),
              total,
            })
          : undefined,
      onDragCancel: ({ active }) =>
        t('shell.exchangeGroup.dnd.cancelled', { name: nameOf(active.id) }),
    }
  }, [exchanges, order, t])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const next = reorderIds(order, String(active.id), String(over.id))
    if (next === order) return // no-op drop: same reference back
    setOrder(next)
    // Fire-and-forget: local state already shows the result, so the drag is
    // never blocked on a round trip and there is no spinner to render.
    void setExchangeOrder(next)
  }

  async function select(id: string) {
    if (id === activeId) return
    // setActiveExchange revalidates the whole tree; the action response already
    // re-renders the current page, so only navigate if we are not on it.
    await setActiveExchange(id)
    if (pathname !== '/dashboard') router.push('/dashboard')
  }

  return (
    <div className="border-t pt-3.5">
      <div
        className={cn(
          'flex items-center px-3',
          collapsed ? 'justify-center' : 'justify-between pl-6 pr-3',
        )}
      >
        {!collapsed && (
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-tertiary">
            {t('shell.exchangeGroup.title')}
          </span>
        )}
        <button
          type="button"
          onClick={onNewExchange}
          title={collapsed ? t('shell.exchangeGroup.add') : undefined}
          aria-label={t('shell.exchangeGroup.add')}
          className={cn(
            'rounded-pill text-[11.5px] font-semibold text-brand hover:bg-brand-soft',
            collapsed ? 'flex h-7 w-7 items-center justify-center text-base' : 'px-2.5 py-1',
          )}
        >
          {collapsed ? '+' : t('shell.exchangeGroup.add')}
        </button>
      </div>

      <div className={cn('mt-1.5 flex flex-col gap-0.5 px-3', collapsed && 'items-center')}>
        {rows.length === 0 && !collapsed && (
          <p className="px-3 py-2 text-[12.5px] text-tertiary">
            {t('shell.exchangeGroup.empty')}
          </p>
        )}
        {collapsed ? (
          // The 68 px rail shows unlabelled colour dots — dragging dots you
          // cannot read is not useful, so it renders the persisted order but
          // offers no drag affordance.
          rows.map((ex) => (
            <RowButton key={ex.id} ex={ex} activeId={activeId} collapsed onSelect={select} />
          ))
        ) : (
          <DndContext
            // Explicit, because dnd-kit's fallback is a MODULE-GLOBAL counter
            // (@dnd-kit/utilities useUniqueId: `ids[prefix] + 1`). On the server
            // that module outlives the request, so the counter climbs per
            // request while the freshly-loaded client bundle always starts at
            // 0 — every page after the server's first one hydrated with a
            // mismatched aria-describedby on the grips. Any stable string
            // short-circuits it (`if (value) return value`); there is only one
            // DndContext in the app, so this one is enough.
            id="exchange-list"
            sensors={sensors}
            collisionDetection={closestCenter}
            // Vertical only (a row can never drift out of the 250 px rail), and
            // clamped to the rows' own container — which starts below the
            // "Mes échanges" header and ends at the last row, so a drag can run
            // past neither end of the list.
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
            accessibility={{ announcements }}
          >
            <SortableContext items={rows.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {rows.map((ex) => (
                <SortableExchangeRow
                  key={ex.id}
                  ex={ex}
                  activeId={activeId}
                  onSelect={select}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
