import { useCallback, useEffect, useRef, useState } from 'react'

interface State<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/** Liten datahenter: kjør en async funksjon, få data/feil/laster og en reload. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true })
  const fnRef = useRef(fn)
  fnRef.current = fn
  const tick = useRef(0)

  const run = useCallback(async () => {
    const id = ++tick.current
    setState(s => ({ ...s, loading: true }))
    try {
      const data = await fnRef.current()
      if (id === tick.current) setState({ data, error: null, loading: false })
    } catch (e) {
      if (id === tick.current) setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false })
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run() }, [run, ...deps])

  return { ...state, reload: run }
}

/** Kaster feilmeldingen fra Supabase-svaret, så useQuery fanger den. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}
