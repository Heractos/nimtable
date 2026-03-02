# Nested Namespaces: Where and What to Fix

This document explains which files are responsible for displaying namespaces in Nimtable and what changes are needed so that **nested namespaces** (e.g. `analytics`, `analytics.staging`, `analytics.staging.prod`) from your Iceberg catalog appear correctly everywhere in the UI.

---

## Summary: What Works vs What Doesn’t

| Area | Nested support? | Notes |
|------|------------------|--------|
| **Sidebar tree** (`tree-items.tsx`) | ✅ Yes | Uses full tree from `loadNamespacesAndTables`, recurses into `children`. |
| **CatalogExplorer** (left panel on Data pages) | ✅ Yes | Uses `loadNamespaceChildren(parent)` and recursive `NamespaceNode`; shows nested namespaces. |
| **Data loader** (`data-loader.ts`) | ✅ Yes | `loadNamespacesAndTables` and `loadNamespaceChildren` both support parent/children. |
| **Backend (Iceberg REST)** | ✅ Yes | `listNamespaces({ parent })` is used; no backend change needed. |
| **useNamespaces hook** | ❌ No | Flattens only **root** nodes; nested namespaces are dropped. |
| **Namespaces page** (table list) | ❌ No | Uses `useNamespaces` → only root namespaces shown. |
| **Catalog stats** (namespace count) | ❌ No | Uses `useNamespaces` → only root namespaces counted. |
| **Tables list / useTables** | ❌ No | Tables are built from `useNamespaces`; tables in nested namespaces are missing. |
| **Agent: getNamespaces** | ❌ No | Uses `listNamespaces()` which only returns root namespaces. |

So: **tree UIs already show nested namespaces**. The **flat list** used by the Namespaces page, catalog stats, and table discovery is built from a hook that ignores the tree and only uses top-level namespaces. Fixing that hook and the type it exposes fixes the rest.

---

## Files Involved (short reference)

| File | Role |
|------|------|
| `src/lib/data-loader.ts` | Loads namespace tree and single-level children; already supports nesting. |
| `src/app/data/hooks/useNamespaces.tsx` | **Main fix:** must flatten the tree so every namespace (root + nested) is in the list. |
| `src/app/data/namespaces/NamespacesContent.tsx` | Namespaces table; will show nested once `useNamespaces` is fixed; optional: show hierarchy (e.g. indent or path). |
| `src/app/data/hooks/useTables.tsx` | Builds table list from `useNamespaces`; will include nested tables once hook exposes full namespace paths. |
| `src/app/data/catalogs/CatalogsContent.tsx` | Uses `useNamespaces` for namespace count; will be correct after hook fix. |
| `src/app/data/utils.tsx` (`useCatalogStats`) | Same; uses `useNamespaces` for counts. |
| `src/app/data/tables/TablesContent.tsx` | Uses `useNamespaces` for namespace filter dropdown; needs full paths (will work after hook fix). |
| `src/components/sidebar/tree-items.tsx` | Renders tree from `NamespaceTables` with `children`; no change needed. |
| `src/components/data/CatalogExplorer.tsx` | Lazy tree via `loadNamespaceChildren`; no change needed. |
| `src/lib/agent/tool.ts` | `getNamespaces` uses `listNamespaces` (root-only); optional: return full list including nested. |

---

## 1. Root cause: `useNamespaces` only uses top-level nodes

**File:** `src/app/data/hooks/useNamespaces.tsx`

**Current behavior:**  
`loadNamespacesAndTables(catalog)` returns a **tree**: `NamespaceTables[]` where each node has `name`, `shortName`, `tables`, and `children`. The hook does:

```ts
return query.data.map((ns) => ({
  id: ns.name,
  name: ns.shortName,   // ← only last segment
  catalog,
  tableCount: ns.tables.length,
  tables: ns.tables,
}))
```

So it only iterates the **root** array. Nested namespaces live in `ns.children` and are never included. Also, `name` is set to `shortName`, so even root entries use the short name instead of the full path (e.g. `analytics.staging`).

**Required fix:**

1. **Flatten the tree** so that every namespace (root and all descendants) gets one entry in the list.
2. Use the **full namespace path** as the canonical `name` (and for `id`), so that:
   - The Namespaces page can link to `/data/tables?catalog=...&namespace=analytics.staging`.
   - `useTables` can attach the correct `namespace` to each table (full path).
   - Catalog stats count all namespaces.
3. Optionally add `shortName` for display (e.g. “staging” under “analytics.staging”).

**Suggested implementation:**

- Add a small helper that walks the tree and returns a flat array, e.g.:

  ```ts
  function flattenNamespaces(
    nodes: NamespaceTables[],
    catalog: string
  ): Array<{ id: string; name: string; shortName: string; catalog: string; tableCount: number; tables: string[] }> {
    const result: Array<...> = []
    function walk(nodes: NamespaceTables[]) {
      for (const ns of nodes) {
        result.push({
          id: ns.name,
          name: ns.name,        // full path, e.g. "analytics.staging"
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
  ```

- In the hook, replace the current `query.data.map(...)` with:

  ```ts
  return flattenNamespaces(query.data, catalog)
  ```

- Update the exported `Namespace` type to include `shortName` if you want the Namespaces table to show “short name” or “full path” (or both).

After this, `namespaces` will include every namespace in the catalog (e.g. `analytics`, `analytics.staging`, `analytics.staging.prod`), and downstream consumers will see nested namespaces and correct counts.

---

## 2. Namespaces page: display and navigation

**File:** `src/app/data/namespaces/NamespacesContent.tsx`

**Current behavior:**  
Renders a flat table of namespaces (Namespace, Catalog, Tables). Because `useNamespaces` currently only returns root namespaces and uses `shortName` as `name`, only root namespaces appear, and links use the short name.

**Required fix:**

- **No structural change required** once `useNamespaces` is fixed: the list will automatically include nested namespaces, and `namespace.name` will be the full path, so the existing link  
  `router.push(\`/data/tables?catalog=${namespace.catalog}&namespace=${namespace.name}\`)`  
  will work for nested namespaces (e.g. `namespace=analytics.staging`).

**Optional improvements:**

- Show **full path** in the “Namespace” column (e.g. `analytics.staging`) so nested namespaces are unambiguous. You can use `namespace.name` (full path) or add a column that shows both full path and short name.
- If you want a hierarchy in the table, you can sort by `name` and optionally indent or show a breadcrumb based on `name.split('.').length` or `shortName` for the last segment.

---

## 3. Tables list and namespace filter

**Files:**  
`src/app/data/hooks/useTables.tsx`  
`src/app/data/tables/TablesContent.tsx`

**Current behavior:**  
`useTables` builds the list of tables from `useNamespaces`:

```ts
const tablesNames = namespaces.flatMap((namespace) =>
  namespace.tables.map((table) => ({
    table,
    namespace: namespace.name,  // must be full path for nested
    catalog: namespace.catalog,
  }))
)
```

Today `namespace.name` is only the short name and only root namespaces exist in `namespaces`, so tables in nested namespaces never appear.

**Required fix:**

- **No change needed in `useTables` or `TablesContent`** once `useNamespaces` is fixed: `namespace.name` will be the full path and every namespace (including nested) will be in `namespaces`, so:
  - All tables in nested namespaces will appear in the tables list.
  - The namespace filter dropdown will list all namespaces (e.g. `analytics`, `analytics.staging`) and filtering by `table.namespace === selectedNamespace` will work.

---

## 4. Catalog stats (namespace count)

**Files:**  
`src/app/data/catalogs/CatalogsContent.tsx`  
`src/app/data/utils.tsx` (e.g. `useCatalogStats`)

**Current behavior:**  
They use `namespaces.filter((ns) => ns.catalog === catalog)` and then `namespaceCount: catalogNamespaces.length`. Because only root namespaces are in `namespaces`, the count is too low when you have nested namespaces.

**Required fix:**

- **No change needed** once `useNamespaces` is fixed: the flattened list will include all namespaces per catalog, so the count will be correct.

---

## 5. Agent: `getNamespaces` (optional)

**File:** `src/lib/agent/tool.ts`

**Current behavior:**  
`getNamespaces` uses `listNamespaces(catalog)`, which in `data-loader.ts` only returns **root** namespaces (top-level only).

**Required fix for full nested support:**

- Either:
  - Use `loadNamespacesAndTables(catalog)` and return a flattened list of namespace names (e.g. `nodes.flatMap(flatten).map(n => n.name)`), or
  - Add a helper in `data-loader.ts` that returns all namespaces (e.g. by calling `listNamespaces` with recursion or by reusing the same tree-walk as in the hook) and call that from the tool.

Then the Copilot will see and reference nested namespaces (e.g. `analytics.staging`) when suggesting queries or listing namespaces.

---

## 6. Backend and data loader (no change required)

**Files:**  
`backend/.../RESTCatalogAdapter.java`  
`src/lib/data-loader.ts`

- **Backend:** Already supports `listNamespaces({ parent })` and returns child namespaces; no change needed.
- **data-loader.ts:**  
  - `loadNamespacesAndTables` already fetches the full tree (root + recursive children).  
  - `loadNamespaceChildren(catalog, parentNamespace)` is used by CatalogExplorer and already supports nested levels.  
No changes are required here for nested namespaces to work in the UI once the hook is fixed.

---

## 7. CreateNamespaceModal and listNamespaces

**File:** `src/components/namespace/CreateNamespaceModal.tsx`

- Already supports **parent namespace** and builds full path with `parentNamespace + '.' + formData.namespace`. No change needed.

**File:** `src/lib/data-loader.ts` → `listNamespaces(catalog)`

- Returns only root namespaces. It is used by the agent and possibly elsewhere. For the **UI** (Namespaces page, tables, stats), the fix is in `useNamespaces`; for the **agent**, see section 5.

---

## Implementation order

1. **Implement the flattening in `useNamespaces`** (and add `shortName` to the type if desired).
2. **Verify** the Namespaces page shows all namespaces and links work (including nested).
3. **Verify** the Tables page shows tables from nested namespaces and the namespace filter lists them.
4. **Verify** catalog stats show the correct namespace count.
5. Optionally: **Agent** – make `getNamespaces` return all namespaces (e.g. via flattened tree or a dedicated loader).
6. Optionally: **NamespacesContent** – improve display (full path column, or light hierarchy).

---

## Quick checklist

- [ ] `src/app/data/hooks/useNamespaces.tsx`: Flatten tree; use full path as `name` (and `id`); optionally add `shortName`.
- [ ] `src/app/data/namespaces/NamespacesContent.tsx`: Use full path for display/link (automatic after hook fix); optionally improve column/hierarchy.
- [ ] `src/app/data/hooks/useTables.tsx`: No change (uses hook output).
- [ ] `src/app/data/catalogs/CatalogsContent.tsx`: No change (uses hook output).
- [ ] `src/app/data/utils.tsx`: No change (uses hook output).
- [ ] `src/app/data/tables/TablesContent.tsx`: No change (uses hook output).
- [ ] `src/lib/agent/tool.ts`: Optional – return full namespace list including nested in `getNamespaces`.
- [ ] `src/lib/data-loader.ts`: No change.
- [ ] `src/components/sidebar/tree-items.tsx`: No change.
- [ ] `src/components/data/CatalogExplorer.tsx`: No change.

Once the hook is updated, nested namespaces from your Iceberg catalog will appear in the Nimtable namespaces table, catalog stats, and tables list, and the CatalogExplorer tree will continue to show them as it does today.

---

## Running the dev environment without Docker

To try the nested-namespace changes locally without Docker:

1. **Backend (Nimtable Java API + catalog proxy)**  
   - JDK 17+ required.  
   - From repo root: `cd backend && ./gradlew run`  
   - Uses `backend/config.yaml`. For a real catalog, point it at your Iceberg REST endpoint (or use a local Postgres and catalog as in HACKING.md).  
   - API: **http://localhost:8182**

2. **Frontend (Next.js)**  
   - From repo root:  
     - `pnpm install`  
     - `pnpm prisma generate`  
     - `pnpm dev`  
   - App: **http://localhost:3000**

3. **Optional: database**  
   - Nimtable stores catalog metadata and auth in Postgres. If your backend config uses Postgres, start Postgres (e.g. Docker or Homebrew) and set `DATABASE_URL` in `.env` (see `.env.example`). For backend-only catalog proxying without Nimtable DB features, a minimal in-memory config may be enough.

4. **Point the UI at the backend**  
   - Ensure the frontend is configured to use `http://localhost:8182` for the Java API (see `JAVA_API_URL` or equivalent in `.env` / env docs in HACKING.md).

Then open **http://localhost:3000**, go to **Data → Catalogs** (or **Namespaces**), and confirm that nested namespaces from your Iceberg catalog appear in the table and in the CatalogExplorer tree.
