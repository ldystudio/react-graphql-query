# Mutation Flows

## Primary APIs

- React component mutation -> `useGraphMutation`
- Non-hook mutation -> `graphMutation`

Both APIs return parsed mutation data instead of the GraphQL root object.

## Callback context

`useGraphMutation` callbacks receive a library-level `GraphMutationContext`:

- `client`
- `definition`
- `queryClient`

This is the preferred place to read the shared `QueryClient` for manual optimistic updates.

## Optimistic update via `optimisticUpdate` (preferred)

`useGraphMutation` accepts an `optimisticUpdate` option. It cancels in-flight queries for the target, snapshots the current cache, writes the optimistic value, and restores the snapshot automatically when the mutation fails. When a success should refresh from the server, set `invalidateQueryOnSuccess: true`.

```ts
const mutation = useGraphMutation<
    typeof UPDATE_PRODUCT,
    unknown,
    UpdateProductData,
    typeof PRODUCT_LIST
>(UPDATE_PRODUCT, {
    optimisticUpdate: {
        query: PRODUCT_LIST,
        getOptimisticState: ({ currentData, variables }) =>
            currentData?.map((item) =>
                item.id === variables.id ? { ...item, title: variables.title } : item
            ),
    },
});
```

Option fields:

- `query` — the definition whose cache the mutation optimistically updates. The data type is inferred from this definition, so callers do not write `GraphQueryData<...>` by hand.
- `queryVariables?` — variables for the target query; used to build the exact query key (omit when there is no variable suffix).
- `kind?: "query" | "infinite"` — cache shape. `"query"` (default) reads/writes parseKey-parsed data like `useGraphQuery(...).data`; `"infinite"` reads/writes the whole `InfiniteData` like `useInfiniteGraphQuery(...).data`.
- `getOptimisticState` — receives `{ currentData, variables }` and returns the next cached value, or `undefined` to leave the cache untouched. Return a new value; do not mutate in place.
- `invalidateQueryOnSuccess?: boolean` — default `false`. When `true`, invalidates the target query after a successful mutation so it refetches.

Behavior notes:

- Failure restores the snapshot automatically; a successful mutation (with `invalidateQueryOnSuccess: false`, the default) keeps the optimistic value in the cache.
- Existing `onMutate`/`onSuccess`/`onError` callbacks still run, and their `onMutateResult` argument is passed through unchanged.
- Generic order is `TDefinition, TOnMutateResult, TData, TQuery, TQueryData`. `TQuery` defaults to `TDefinition`; `TQueryData` defaults to `GraphQueryData<TQuery>`. For `kind: "infinite"`, pass `InfiniteData<...>` explicitly as `TQueryData`, because the page param cannot be inferred from the query definition.

Infinite example:

```ts
useGraphMutation<
    typeof DELETE_POST,
    unknown,
    { ok: boolean },
    typeof FEED,
    InfiniteData<Feed["catalog"]["posts"], string | null>
>(DELETE_POST, {
    optimisticUpdate: {
        query: FEED,
        queryVariables: { first: 20 },
        kind: "infinite",
        getOptimisticState: ({ currentData, variables }) =>
            currentData
                ? {
                      ...currentData,
                      pages: currentData.pages.map((page) => ({
                          ...page,
                          nodes: page.nodes.filter((item) => item.id !== variables.id),
                      })),
                  }
                : currentData,
    },
});
```

## Manual optimistic update pattern

For lower-level control, use cache helpers directly on `onMutate`/`onError`/`onSettled`:

```ts
const mutation = useGraphMutation(UPDATE_PRODUCT, {
    onMutate: async (variables, context) => {
        await cancelGraphQuery(context.queryClient, PRODUCT_LIST);

        const previous = getGraphData(context.queryClient, PRODUCT_LIST);

        setGraphData(context.queryClient, PRODUCT_LIST, undefined, (current) =>
            current?.map((item) =>
                item.id === variables.id ? { ...item, title: variables.title } : item
            )
        );

        return { previous };
    },
    onError: (_error, _variables, rollback, context) => {
        if (rollback?.previous) {
            setGraphData(context.queryClient, PRODUCT_LIST, undefined, rollback.previous);
        }
    },
    onSettled: (_data, _error, _variables, _rollback, context) => {
        void invalidateGraphQuery(context.queryClient, PRODUCT_LIST);
    },
});
```

## Defaults and precedence

- `useGraphMutation` can read provider client for hook usage
- `graphMutation` cannot read provider client
- definition-level default variables act as fallbacks and can be overridden by call-site variables

## Guidance

- Recommend `useGraphMutation` when the user is already in React component code
- Recommend `graphMutation` for server actions, route handlers, command handlers, or other non-hook code
- Prefer the `optimisticUpdate` option over the manual pattern unless fine-grained control over rollback or invalidation is needed
- Prefer cache helpers over manually rebuilding root cache shapes
