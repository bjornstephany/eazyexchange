'use client'
import { useEffect, useRef } from 'react'

/**
 * Close a floating panel on outside pointerdown or Escape.
 *
 * Extracted from OrganizerShell when the notifications bell became a second
 * header menu — two hand-rolled copies of this effect would have drifted.
 * Returns the ref to attach to the element that must NOT dismiss the panel:
 * the trigger and the panel together, so clicking the trigger to close does not
 * race the outside handler.
 *
 * The callback is held in a ref rather than listed as a dependency: callers
 * pass inline arrows, and depending on it would tear down and re-add both
 * listeners on every render.
 */
export function useDismissable<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
) {
  const ref = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    function handleOutside(e: Event) {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
        onCloseRef.current()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return ref
}
