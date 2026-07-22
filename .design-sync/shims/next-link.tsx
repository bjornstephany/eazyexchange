import * as React from 'react'

/* next/link shim for the design bundle.
 *
 * Claude Design renders these components outside Next, where next/link's client
 * router internals reference process.env.__NEXT_* and throw "process is not
 * defined", taking the whole bundle down with them. next/link ultimately renders
 * a plain anchor, so this shim is the faithful rendering — it just drops the
 * Next-only navigation props, which have no meaning without a router. */

type NextLinkProps = {
  href?: string | { pathname?: string }
  children?: React.ReactNode
  // Next-only props, accepted and ignored so React never sees them on the DOM.
  prefetch?: unknown
  replace?: unknown
  scroll?: unknown
  shallow?: unknown
  passHref?: unknown
  legacyBehavior?: unknown
  locale?: unknown
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>

const Link = React.forwardRef<HTMLAnchorElement, NextLinkProps>(function Link(
  {
    href,
    children,
    prefetch: _prefetch,
    replace: _replace,
    scroll: _scroll,
    shallow: _shallow,
    passHref: _passHref,
    legacyBehavior: _legacyBehavior,
    locale: _locale,
    ...rest
  },
  ref,
) {
  const to = typeof href === 'string' ? href : (href?.pathname ?? '#')
  return (
    <a ref={ref} href={to} {...rest}>
      {children}
    </a>
  )
})

export default Link
