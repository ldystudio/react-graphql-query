# Cache Helpers

## Prefer these helpers

- `queryKeyOf`
- `getGraphData`
- `setGraphData`
- `invalidateGraphQuery`
- `cancelGraphQuery`
- `removeGraphQuery`
- `resetGraphQuery`

Use them when the user wants to work with parsed data instead of rebuilding the full GraphQL root shape manually.

## Key behavior

`setGraphData` writes through `parseKey`, so it updates only the parsed branch while preserving sibling fields on the root object.

Important boundary:

- if the updater returns `undefined` and cache already exists, current implementation keeps the existing cache unchanged
- if the updater returns `undefined` and the query key is missing, it does not create a new cache entry

Do not describe this as "deleting cache".

## Recommendation

For optimistic updates:

1. `cancelGraphQuery`
2. `getGraphData`
3. `setGraphData`
4. rollback with `setGraphData` if needed
5. `invalidateGraphQuery` on settle

## Query-key guidance

When cache behavior depends on variables, pass the same `variables` object to cache helpers so they resolve the same query key as the query or mutation call site.
