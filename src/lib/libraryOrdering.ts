export interface IdentifiedItem {
  id: string
}

/**
 * Reorders loaded library items according to the order supplied by a series
 * or collection while preserving the existing order for items not present in
 * that ordered list.
 */
export function orderItemsByIds<T extends IdentifiedItem>(items: T[], orderedIds: string[]) {
  const order = new Map(orderedIds.map((id, index) => [id, index]))
  return items
    .map((item, index) => ({ item, index, order: order.get(item.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ item }) => item)
}
