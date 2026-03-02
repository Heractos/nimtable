import {
  DistributionItem,
  getFileDistribution,
} from "@/lib/data-loader"
import { useQueries } from "@tanstack/react-query"
import { useNamespaces } from "./useNamespaces"
import { useCatalogs } from "./useCatalogs"

export interface Table {
  table: string
  catalog: string
  namespace: string
  ranges: {
    [range: string]: DistributionItem
  }
  dataFileCount: number
  positionDeleteFileCount: number
  eqDeleteFileCount: number
  dataFileSizeInBytes: number
  positionDeleteFileSizeInBytes: number
  eqDeleteFileSizeInBytes: number
  dataFileRecordCount: number
  positionDeleteFileRecordCount: number
  eqDeleteFileRecordCount: number
}

const emptyDistribution = (ident: {
  catalog: string
  namespace: string
  table: string
}): Table => ({
  ...ident,
  ranges: {},
  dataFileCount: 0,
  positionDeleteFileCount: 0,
  eqDeleteFileCount: 0,
  dataFileSizeInBytes: 0,
  positionDeleteFileSizeInBytes: 0,
  eqDeleteFileSizeInBytes: 0,
  dataFileRecordCount: 0,
  positionDeleteFileRecordCount: 0,
  eqDeleteFileRecordCount: 0,
})

export const useAllTables = () => {
  const {
    catalogs,
    isLoading: isLoadingCatalogs,
    refetch: refetchCatalogs,
  } = useCatalogs()

  const { namespaces, isLoading: isLoadingNamespaces } = useNamespaces(catalogs)

  const tablesNames = namespaces.flatMap((namespace) => {
    return namespace.tables.map((table) => {
      return {
        table: table,
        namespace: namespace.name,
        catalog: namespace.catalog,
      }
    })
  })

  const tablesQueries = useQueries({
    queries:
      tablesNames.map((table) => {
        return {
          queryKey: ["tables", table.catalog, table.namespace, table.table],
          queryFn: () =>
            getFileDistribution(
              table.catalog,
              table.namespace,
              table.table
            ).then((data) => ({
              ...data,
              table: table.table,
              catalog: table.catalog,
              namespace: table.namespace,
            })),
          enabled: !!table.catalog && !!table.namespace && !!table.table,
        }
      }) || [],
  })

  // Always show every table from namespaces; merge in distribution when loaded (or use empty when still loading/failed)
  const tables = tablesNames.map((ident, index) => {
    const data = tablesQueries[index]?.data
    return data
      ? { ...emptyDistribution(ident), ...data }
      : emptyDistribution(ident)
  })

  return {
    tables,
    isLoading: isLoadingCatalogs || isLoadingNamespaces,
    isFileDistributionLoading: tablesQueries.some((query) => query.isLoading),
    error: tablesQueries.some((query) => query.error),
    refetchCatalogs,
  }
}
