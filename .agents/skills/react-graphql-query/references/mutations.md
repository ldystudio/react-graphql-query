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

This is the preferred place to read the shared `QueryClient` for optimistic updates.

## Optimistic update pattern

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
- Prefer cache helpers over manually rebuilding root cache shapes
