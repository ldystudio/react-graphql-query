# Infinite Query Flows

## Primary APIs

- React component pagination -> `useInfiniteGraphQuery`
- Need a TanStack options object -> `graphInfiniteQueryOptions`

## Pagination recommendation

For cursor pagination, prefer parsing to the connection object, not directly to `nodes`.

Good:

```ts
parseKey: "catalog.products"
```

Risky for pagination metadata:

```ts
parseKey: "catalog.products.nodes"
```

Parsing to the connection keeps `pageInfo` available for `getNextPageParam` and `getPreviousPageParam`.

## Required inputs

Typical infinite-query setup needs:

- `initialPageParam`
- `pageParamToVariables`
- `getNextPageParam`

Optional:

- `getPreviousPageParam`
- `select`
- `initialData`

## Example pattern

```ts
const query = useInfiniteGraphQuery(PRODUCT_CONNECTION, {
    variables: { first: 20 },
    initialPageParam: null as string | null,
    pageParamToVariables: (pageParam, variables) => ({
        ...variables,
        after: pageParam,
        first: variables?.first ?? 20,
    }),
    getNextPageParam: (lastPage) =>
        lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : undefined,
});
```

## Provider boundary

- `useInfiniteGraphQuery` can read provider client
- `graphInfiniteQueryOptions` cannot read provider client or provider debug-header settings

If the user is building options outside hooks, they must supply `client` through the definition or options.
