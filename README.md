# react-graphql-query

Definition-driven GraphQL helpers for React and React Native. It combines `graphql-request`, `@tanstack/react-query`, typed GraphQL documents, parsed response data, and cache helpers behind one reusable definition object.

[简体中文](./README.zh-CN.md)

## What You Get

- Define each GraphQL operation once with `defineGraphql`.
- Use the same definition in hooks, non-hook fetches, mutations, infinite queries, and cache helpers.
- Read parsed data directly, for example `catalog.product`, instead of the whole GraphQL root object.
- Infer result and variable types from `TypedDocumentNode`, or provide your own root type.
- Provide a shared `GraphQLClient` through `GraphqlQueryProvider`.
- Generate `defineGraphql` wrapper files from `.graphql` operations with the built-in codegen flow.

## Install

```bash
npm install @ldystudio/react-graphql-query @tanstack/react-query graphql-request graphql
```

Peer requirements:

- `react >= 18`
- `@tanstack/react-query >= 5`
- `graphql-request >= 6.1.0`

For the built-in codegen CLI, also install GraphQL Code Generator in your app project:

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/client-preset graphql
```

## 5-Minute Setup

### 1. Create a GraphQL client and provider

```tsx
import { QueryClient } from "@tanstack/react-query";
import { GraphQLClient } from "graphql-request";
import { GraphqlQueryProvider } from "@ldystudio/react-graphql-query";

const graphClient = new GraphQLClient("https://example.com/graphql");
const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <GraphqlQueryProvider client={graphClient} queryClient={queryClient}>
            {children}
        </GraphqlQueryProvider>
    );
}
```

Use `GraphqlQueryProvider` at app root. It provides both `GraphQLClient` and TanStack Query's `QueryClient`.

### 2. Define an operation

Manual document style:

```ts
import { gql } from "graphql-request";
import { defineGraphql } from "@ldystudio/react-graphql-query";

type ProductDetailRoot = {
    catalog: {
        product: {
            id: string;
            title: string;
        };
    };
};

export const PRODUCT_DETAIL = defineGraphql<ProductDetailRoot, { id: string }>()({
    document: gql`
        query ProductDetail($id: ID!) {
            catalog {
                product(id: $id) {
                    id
                    title
                }
            }
        }
    `,
    parseKey: "catalog.product",
});
```

Generated document style:

```ts
import { defineGraphql } from "@ldystudio/react-graphql-query";
import * as Gen from "../__generated__/main";

export const PRODUCT_DETAIL = defineGraphql<Gen.ProductDetailQuery, Gen.ProductDetailQueryVariables>()({
    document: Gen.ProductDetailDocument,
    parseKey: "catalog.product",
});
```

### 3. Query data in a component

```tsx
import { useGraphQuery } from "@ldystudio/react-graphql-query";
import { PRODUCT_DETAIL } from "./gql";

export function ProductTitle({ id }: { id: string }) {
    const query = useGraphQuery(PRODUCT_DETAIL, {
        variables: { id },
        enabled: Boolean(id),
    });

    if (query.isPending) return null;
    if (query.isError) return <span>Failed to load product</span>;

    return <h1>{query.data.title}</h1>;
}
```

`query.data` is the parsed value at `parseKey`, so this component receives `catalog.product` directly.

## Recommended Codegen Workflow

The fastest long-term setup is:

1. Write `.graphql` operation files.
2. Run `react-graphql-query-codegen`.
3. Import generated `defineGraphql` wrappers from `*.gql.ts`.
4. Use `useGraphQuery`, `useGraphMutation`, and cache helpers in app code.

### Install codegen dependencies

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/client-preset graphql
```

### Add script

```json
{
    "scripts": {
        "codegen": "react-graphql-query-codegen --config graphql.codegen.ts"
    }
}
```

### Create `graphql.codegen.ts`

```ts
import { defineGraphqlCodegenProject } from "@ldystudio/react-graphql-query/codegen";

const API_URL = "https://example.com/graphql/v1";

export default defineGraphqlCodegenProject({
    targets: {
        main: {
            schema: API_URL,
            documents: ["src/service/gql/main.graphql"],
            output: "src/service/__generated__/main.ts",
            definitions: {
                output: "src/service/gql/main.gql.ts",
            },
            config: {
                defaultScalarType: "unknown",
            },
        },
    },
    format: {
        command: ["bunx", "biome", "check", "--write"],
    },
});
```

### Example `.graphql` file

```graphql
query ProductDetail($id: ID!) {
    catalog {
        product(id: $id) {
            id
            title
        }
    }
}
```

### Run codegen

```bash
npm run codegen
```

With `definitions.output`, the CLI appends missing wrappers like this:

```ts
import { defineGraphql } from "@ldystudio/react-graphql-query";
import * as Gen from "../__generated__/main";

export const PRODUCT_DETAIL = defineGraphql<Gen.ProductDetailQuery, Gen.ProductDetailQueryVariables>()({
    document: Gen.ProductDetailDocument,
});
```

The definitions generator is append-only. Existing definitions are not overwritten, so you can safely add `parseKey`, `key`, custom root types, default options, or `client` manually.

For a target with a dedicated GraphQL client:

```ts
definitions: {
    output: "src/service/gql/secondary.gql.ts",
    client: {
        name: "SecondaryGraphqlClient",
        importPath: "~/service/client",
    },
}
```

More complete examples:

- [`examples/codegen/config.ts`](./examples/codegen/config.ts): multi-target codegen config
- [`examples/codegen/overrides.ts`](./examples/codegen/overrides.ts): operation type overrides
- [`examples/codegen/GENERATED_STRUCTURE.md`](./examples/codegen/GENERATED_STRUCTURE.md): generated file structure and wrappers

All examples use placeholder endpoints, operation names, and field paths.

## Core Concepts

### Definition

A definition is the reusable unit of this library.

```ts
const PRODUCT_DETAIL = defineGraphql<Root, Variables>()({
    document,
    parseKey: "catalog.product",
    key: ["catalog", "product-detail"],
    variables: { locale: "en" },
    staleTime: 60_000,
});
```

Common fields:

- `document`: GraphQL query or mutation document. Required.
- `parseKey`: response path to return as data, such as `catalog.product`; use `""` to return the full root response.
- `key`: optional cache identity independent of `parseKey`.
- `variables`: default variables used when callers omit them.
- `client`: optional definition-level `GraphQLClient`.
- TanStack Query options such as `enabled`, `staleTime`, and `gcTime`.

### `parseKey`

`parseKey` tells the library which part of the GraphQL response should be returned.

```ts
parseKey: "catalog.product"
```

A response like this:

```ts
{
    catalog: {
        product: { id: "p1", title: "Cube" }
    }
}
```

becomes:

```ts
{ id: "p1", title: "Cube" }
```

Use an empty `parseKey` when an operation intentionally reads multiple top-level fields and callers need the full root object:

```ts
const DASHBOARD = defineGraphql()({
    document: Gen.DashboardDocument,
    parseKey: "",
    key: ["dashboard"],
});
```

In that case `query.data` is the complete response, for example `{ notifications, accountSummary }`.

If `parseKey` is omitted, the library tries to infer it from documents with one unambiguous selection path. Explicit `parseKey` always wins.

### `key`

`key` controls cache identity. Use it when the cache key should be stable or different from the response path.

```ts
const PRODUCT_LIST = defineGraphql()({
    document: Gen.ProductListDocument,
    parseKey: "catalog.products.nodes",
    key: ["catalog", "product-list"],
});
```

## Queries

### `useGraphQuery`

Use this in React components.

```ts
const query = useGraphQuery(PRODUCT_DETAIL, {
    variables: { id: "p1" },
});
```

It returns TanStack Query's `UseQueryResult`.

### `graphQuery`

Use this outside React hooks: route loaders, SSR, prefetching, event handlers, scripts.

```ts
const product = await graphQuery(PRODUCT_DETAIL, {
    client: graphClient,
    variables: { id: "p1" },
});
```

### `graphQueryOptions`

Use this when you want raw TanStack Query integration.

```ts
const options = graphQueryOptions(PRODUCT_DETAIL, {
    client: graphClient,
    variables: { id: "p1" },
});
```

## Mutations

### Define a mutation

```ts
export const UPDATE_PRODUCT = defineGraphql<Gen.UpdateProductMutation, Gen.UpdateProductMutationVariables>()({
    document: Gen.UpdateProductDocument,
    parseKey: "catalog.updateProduct",
});
```

### Use it in React

```ts
const mutation = useGraphMutation(UPDATE_PRODUCT);

mutation.mutate({
    id: "p1",
    title: "Updated title",
});
```

Mutation callbacks receive a `GraphMutationContext` with `client`, `definition`, and `queryClient`.

### Use it outside React

```ts
const product = await graphMutation(UPDATE_PRODUCT, {
    client: graphClient,
    variables: {
        id: "p1",
        title: "Updated title",
    },
});
```

## Infinite Queries

Parse to the connection object, not directly to `nodes`, so `pageInfo` remains available.

```ts
const PRODUCT_CONNECTION = defineGraphql<Gen.ProductConnectionQuery, Gen.ProductConnectionQueryVariables>()({
    document: Gen.ProductConnectionDocument,
    parseKey: "catalog.products",
});
```

```ts
const query = useInfiniteGraphQuery(PRODUCT_CONNECTION, {
    variables: { first: 20 },
    initialPageParam: null as string | null,
    pageParamToVariables: (pageParam, variables) => ({
        ...variables,
        first: variables?.first ?? 20,
        after: pageParam,
    }),
    getNextPageParam: (lastPage) =>
        lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : undefined,
});
```

Use `graphInfiniteQueryOptions` for raw TanStack Query integration.

## Cache Helpers

Cache helpers operate on parsed data instead of requiring you to rebuild the GraphQL root object.

Available helpers:

- `queryKeyOf`
- `getGraphData`
- `setGraphData`
- `invalidateGraphQuery`
- `cancelGraphQuery`
- `removeGraphQuery`
- `resetGraphQuery`

Optimistic update example:

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

If a `setGraphData` updater returns `undefined`, existing cache data is kept unchanged and missing cache entries are not created.

## Client Resolution

For hook APIs, client priority is:

1. `definition.client`
2. `options.client`
3. provider client from `GraphqlClientProvider` or `GraphqlQueryProvider`

For non-hook helpers such as `graphQuery`, `graphQueryOptions`, `graphInfiniteQueryOptions`, and `graphMutation`, provider context is not available. Pass `client` through the definition or the call options.

## Debug Headers

`GraphqlClientProvider` and `GraphqlQueryProvider` can add `x-graph-parse-key` to hook requests:

```tsx
<GraphqlQueryProvider client={graphClient} queryClient={queryClient} debugParseKeyHeader>
    <App />
</GraphqlQueryProvider>
```

This is useful for logging in `graphql-request` middleware. It only affects hook requests under the provider.

## API Cheat Sheet

| Task | API |
| --- | --- |
| Define operation | `defineGraphql` |
| Query in component | `useGraphQuery` |
| Query outside React | `graphQuery` |
| Build TanStack query options | `graphQueryOptions` |
| Mutate in component | `useGraphMutation` |
| Mutate outside React | `graphMutation` |
| Infinite query in component | `useInfiniteGraphQuery` |
| Build infinite query options | `graphInfiniteQueryOptions` |
| Provide app-level clients | `GraphqlQueryProvider` |
| Read/update parsed cache | `getGraphData`, `setGraphData` |

## Limitations

- Only `graphql-request` is supported today.
- Automatic `parseKey` inference only works when the document has exactly one top-level field. Use `parseKey: ""` when you need the full root response for multiple top-level fields.
- Inference stops at the last safe object node when a nested selection branches or becomes ambiguous.
- `debugParseKeyHeader` only affects hook requests under `GraphqlClientProvider` or `GraphqlQueryProvider`.

## License

MIT
