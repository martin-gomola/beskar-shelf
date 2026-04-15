import { useQuery } from '@tanstack/react-query'

import { useAppContext } from '../contexts/AppContext'
import { useClient } from '../contexts/ClientContext'

function useLibraries() {
  const client = useClient()
  const { session } = useAppContext()
  return useQuery({
    queryKey: ['libraries', session?.token],
    queryFn: () => client.getLibraries(),
    enabled: Boolean(session?.token) && client.hasServer(),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePrimaryLibrary() {
  const librariesQuery = useLibraries()
  const primary = librariesQuery.data?.find((library) => library.audiobooksOnly)
    ?? librariesQuery.data?.[0]
  return { librariesQuery, primary }
}
