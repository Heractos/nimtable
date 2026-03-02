/*
 * Copyright 2026 Nimtable
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { getLatestTableSummary } from "@/db/table-summary"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const table = searchParams.get("table")
  const namespace = searchParams.get("namespace")
  const catalog = searchParams.get("catalog")

  if (!table || !namespace || !catalog) {
    return Response.json(
      { error: "Missing table, namespace, or catalog" },
      { status: 400 }
    )
  }

  const tableSummary = await getLatestTableSummary({
    catalogName: catalog,
    namespace: namespace,
    tableName: table,
  })

  // Return 200 with null when no summary exists (e.g. not generated yet) so the UI doesn't show 404
  return Response.json(tableSummary ?? null, { status: 200 })
}
