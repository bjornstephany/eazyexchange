import { LoadingState } from '@/components/LoadingState'

// The parent segment's loading.tsx is a list skeleton; detail pages keep the
// branded splash (spec: deeper pages are out of skeleton scope).
export default function ExchangeDetailLoading() {
  return <LoadingState />
}
