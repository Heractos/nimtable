import { useQueries, type UseQueryResult } from "@tanstack/react-query"

import {
  loadNamespacesAndTables,
  type NamespaceTables,
} from "@/lib/data-loader"

export interface Namespace {
  id: string
  /** Full namespace path (e.g. "analytics.staging") used for links and API calls */
  name: string
  /** Last segment of the path (e.g. "staging") for display */
  shortName: string
  catalog: string
  tableCount: number
  tables: string[]
}

function flattenNamespaces(
  nodes: NamespaceTables[],
  catalog: string
): Namespace[] {
  const result: Namespace[] = []
  function walk(nodes: NamespaceTables[]) {
    for (const ns of nodes) {
      result.push({
        id: ns.name,
        name: ns.name,
        shortName: ns.shortName,
        catalog,
        tableCount: ns.tables.length,
        tables: ns.tables,
      })
      walk(ns.children)
    }
  }
  walk(nodes)
  return result
}

export function useNamespaces(catalogs: string[]) {
  // Use useQueries to fetch namespaces for all catalogs in parallel
  const namespaceQueries = useQueries({
    queries:
      catalogs?.map((catalog) => ({
        queryKey: ["namespaces", catalog],
        queryFn: () => loadNamespacesAndTables(catalog),
        enabled: !!catalog,
      })) || [],
  })

  // Flatten the tree so every namespace (root + nested) appears in the list
  const allNamespaces = namespaceQueries
    .flatMap((query: UseQueryResult<NamespaceTables[]>, index: number) => {
      if (!query.data) return []
      const catalog = catalogs?.[index] || ""
      return flattenNamespaces(query.data, catalog)
    })
    .filter(Boolean)

  return {
    namespaces: allNamespaces,
    isLoading: namespaceQueries.some(
      (query: UseQueryResult<NamespaceTables[]>) => query.isLoading
    ),
    error: namespaceQueries.some(
      (query: UseQueryResult<NamespaceTables[]>) => query.error
    ),
  }
}
