import { useQuery } from '@tanstack/react-query'

import { useClient } from '../contexts/ClientContext'

export function useCollections(libraryId: string | undefined) {
  const client = useClient()
  return useQuery({
    queryKey: ['collections', libraryId],
    queryFn: () => client.getCollections(libraryId!),
    enabled: Boolean(libraryId) && client.hasSession(),
    staleTime: 5 * 60 * 1000,
  })
}
