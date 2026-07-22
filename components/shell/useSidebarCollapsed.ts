'use client'
import { useCallback, useEffect, useState } from 'react'

const KEY = 'ee.sidebar.collapsed'
// Below this viewport width a first-time visitor gets the collapsed sidebar.
const AUTO_COLLAPSE_BELOW = 1100

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    // Safari private mode / storage disabled — behave like a first visit.
    return null
  }
}

export function useSidebarCollapsed(): { collapsed: boolean; toggle: () => void } {
  // The server always renders expanded; the stored preference is applied in an
  // effect so the markup matches on hydration. The width change is a CSS
  // transition, not a layout jump.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = read()
    if (stored === 'true') setCollapsed(true)
    else if (stored === 'false') setCollapsed(false)
    else if (window.innerWidth < AUTO_COLLAPSE_BELOW) setCollapsed(true)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(KEY, String(next))
      } catch {
        // Preference simply does not persist; the session still toggles.
      }
      return next
    })
  }, [])

  return { collapsed, toggle }
}
