---
name: react-graphql-query
description: Help users of this repository's `@ldystudio/react-graphql-query` library define `defineGraphql` definitions, wire `GraphqlClientProvider` or `GraphqlQueryProvider`, write query/mutation/infinite-query flows, use cache helpers, choose `key` vs `parseKey`, and debug parseKey or type inference issues. Use when requests mention this library's exported APIs or ask how to integrate its GraphQL patterns in application code.
---

# React GraphQL Query

Use this skill when the task is about consuming this repository's public library API, not when changing the library internals.

## Workflow

1. Identify the user's task shape.
   `defineGraphql` / typed document setup -> read `references/queries.md`
   mutation usage or optimistic update -> read `references/mutations.md`
   infinite query or pagination -> read `references/infinite.md`
   cache helpers or query invalidation -> read `references/cache.md`
   `parseKey`, `key`, or type inference confusion -> read `references/parsekey-and-types.md`
2. Prefer this library's exported APIs over suggesting raw `graphql-request` or raw TanStack Query patterns when the library already wraps that workflow.
3. Be explicit about client resolution and provider boundaries.
   Hook APIs can read provider client automatically.
   Non-hook APIs and options builders cannot.
4. When showing examples, use executable patterns.
   For typed documents, import a real generated document constant rather than using `declare const`.
5. When the user is choosing between approaches, recommend the highest-level API that still fits:
   component query -> `useGraphQuery`
   non-hook fetch -> `graphQuery`
   component mutation -> `useGraphMutation`
   non-hook mutation -> `graphMutation`
   component pagination -> `useInfiniteGraphQuery`
   external TanStack integration -> `graphQueryOptions` or `graphInfiniteQueryOptions`

## Defaults

- Default provider recommendation: `GraphqlQueryProvider` for app-level setup
- Default query identity rule: use `parseKey` unless the cache identity should stay stable while the parse path changes; then add explicit `key`
- Default pagination recommendation: parse to the connection object, not directly to `nodes`, so `pageInfo` stays available
- Default cache update recommendation: use `getGraphData` and `setGraphData` instead of rebuilding the GraphQL root shape manually

## Boundaries

- Do not describe internal implementation details unless they are needed to explain observable behavior.
- Do not tell users that provider client or debug header settings affect `graphQuery`, `graphQueryOptions`, `graphInfiniteQueryOptions`, or `graphMutation`.
- Do not claim that `setGraphData(..., () => undefined)` deletes an existing cache entry; in this library it behaves as a no-op for existing cache and also does not create missing cache entries.

## References

- `references/queries.md`
  Use for `defineGraphql`, `useGraphQuery`, `graphQuery`, `graphQueryOptions`, provider setup, and client priority.
- `references/mutations.md`
  Use for `useGraphMutation`, `graphMutation`, mutation callback context, and optimistic update patterns.
- `references/infinite.md`
  Use for `useInfiniteGraphQuery`, `graphInfiniteQueryOptions`, cursor pagination, and page-param mapping.
- `references/cache.md`
  Use for cache helper behavior, optimistic update flows, and query-client wrapper helpers.
- `references/parsekey-and-types.md`
  Use for `parseKey` inference, `key` guidance, TypedDocumentNode usage, codegen integration, and common type pitfalls.
