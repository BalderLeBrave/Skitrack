import type { SkitrackApi } from './index'

declare global {
  interface Window {
    skitrack: SkitrackApi
  }
}

export {}
