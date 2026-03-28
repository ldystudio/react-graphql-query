# Query Flows

## When to recommend which API

- React component data fetching -> `useGraphQuery`
- Non-hook fetch or prefetch path -> `graphQuery`
- Need a TanStack options object -> `graphQueryOptions`
- App-level provider setup -> `GraphqlQueryProvider`
- Hook-only client injection -> `GraphqlClientProvider`

## Definition checklist

When helping a user define a query:

1. Start from `defineGraphql(...)`
2. Prefer importing a real generated `TypedDocumentNode` if available
3. Add `parseKey` manually when the document shape branches or the inferred path would stop too early
4. Add `key` only when cache identity should be decoupled from `parseKey`
5. Add `variables` on the definition only for true defaults that should apply when call sites omit variables

## Client priority

For hook queries:

1. `definition.client`
2. `options.client`
3. provider client from `GraphqlClientProvider` or `GraphqlQueryProvider`

For non-hook query helpers:

- `graphQuery` and `graphQueryOptions` do not read provider context
- callers must provide `client` through the definition or options

## Provider recommendation

Prefer `GraphqlQueryProvider` when the app already owns a shared `QueryClient`.

```tsx
<GraphqlQueryProvider client={client} queryClient={queryClient}>
    <App />
</GraphqlQueryProvider>
```

Use `GraphqlClientProvider` only when a `QueryClientProvider` already exists separately or when only the GraphQL client needs to be injected.

## Example pattern

```ts
const PRODUCT_DETAIL = defineGraphql({
    document: ProductDocument,
    parseKey: "catalog.product",
    key: ["catalog", "product-detail"],
});

const query = useGraphQuery(PRODUCT_DETAIL, {
    variables: { id: 7 },
});
```

## Notes

- `graphQuery` returns parsed data, not the GraphQL root object
- `graphQueryOptions` is the right escape hatch when the user wants to plug this library into raw TanStack Query APIs
- `debugParseKeyHeader` only affects hook requests under provider context
