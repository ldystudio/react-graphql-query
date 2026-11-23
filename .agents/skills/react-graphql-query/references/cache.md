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

For regular queries, `setGraphData` writes through `parseKey`, so it updates only the parsed branch while preserving sibling fields on the root object.

For infinite queries, pass `{ kind: "infinite" }` as the final argument to `getGraphData` or `setGraphData`. The cache is the complete `InfiniteData` object; its pages are already parsed and `pageParams` must be preserved when updating pages:

```ts
const variables = { first: 20 };
const previous = getGraphData(queryClient, PRODUCT_CONNECTION, variables, { kind: "infinite" });

setGraphData(queryClient, PRODUCT_CONNECTION, variables, (current) =>
    current && {
        ...current,
        pages: current.pages.map((page) => ({
            ...page,
            nodes: page.nodes.filter((item) => item.id !== 1),
        })),
    },
    { kind: "infinite" }
);
```

The page parameter type defaults to `unknown`. Specify both generic arguments, such as `getGraphData<typeof PRODUCT_CONNECTION, string | null>(...)`, when the cursor type is needed.

Important boundary:

- if the updater returns `undefined` and cache already exists, current implementation keeps the existing cache unchanged
- if the updater returns `undefined` and the query key is missing, it does not create a new cache entry

Do not describe this as "deleting cache".

## Recommendation

For optimistic updates, prefer the `useGraphMutation` `optimisticUpdate` option (see `references/mutations.md`): it handles cancel, snapshot, write, and rollback automatically and infers the target data type from the `query` definition.

Use the cache helpers directly only for lower-level control:

1. `cancelGraphQuery`
2. `getGraphData`
3. `setGraphData`
4. rollback with `setGraphData` if needed
5. `invalidateGraphQuery` on settle

## Query-key guidance

When cache behavior depends on variables, pass the same `variables` object to cache helpers so they resolve the same query key as the query or mutation call site.
