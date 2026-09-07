import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { JobStatus } from '@/api/types'

/**
 * Suit une tâche de fond du sidecar par polling.
 *
 * 1 s d'intervalle : l'import du référentiel dure plusieurs minutes, une
 * cadence plus fine n'apporterait rien à l'affichage et multiplierait les
 * requêtes. Le polling s'arrête dès l'état terminal.
 */
export function useJob(jobId: string | null): {
  job: JobStatus | null
  error: string | null
} {
  const [job, setJob] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) {
      setJob(null)
      setError(null)
      return
    }
    let cancelled = false

    const tick = async (): Promise<void> => {
      try {
        const next = await api.job(jobId)
        if (cancelled) return
        setJob(next)
        if (next.state === 'pending' || next.state === 'running') {
          timer = setTimeout(() => void tick(), 1000)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [jobId])

  return { job, error }
}
