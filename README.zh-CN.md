# react-graphql-query

面向 React 和 React Native 的 definition 驱动 GraphQL 查询辅助库。它把 `graphql-request`、`@tanstack/react-query`、类型化 GraphQL Document、响应解析和缓存辅助能力组合在一个可复用的 definition 里。

[English](./README.md)

## 你会得到什么

- 用 `defineGraphql` 只定义一次 GraphQL operation。
- 同一个 definition 可用于 hooks、非 hook 请求、mutation、infinite query 和缓存辅助函数。
- 直接读取解析后的数据，例如 `catalog.product`，不用每次处理完整 GraphQL root object。
- 可从 `TypedDocumentNode` 推导返回类型和变量类型，也支持手写 root 类型。
- 通过 `GraphqlQueryProvider` 提供共享 `GraphQLClient`。
- 内置 codegen 流程，可从 `.graphql` 自动生成 `defineGraphql` wrapper 文件。

## 安装

```bash
npm install @ldystudio/react-graphql-query @tanstack/react-query graphql-request graphql
```

Peer 要求：

- `react >= 18`
- `@tanstack/react-query >= 5`
- `graphql-request >= 6.1.0`

如果需要使用内置 codegen CLI，在应用项目里再安装：

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/client-preset graphql
```

## 5 分钟接入

### 1. 创建 GraphQL client 和 Provider

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

建议在应用根部使用 `GraphqlQueryProvider`。它会同时提供 `GraphQLClient` 和 TanStack Query 的 `QueryClient`。

### 2. 定义一个 operation

手写 document 方式：

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

生成 document 方式：

```ts
import { defineGraphql } from "@ldystudio/react-graphql-query";
import * as Gen from "../__generated__/main";

export const PRODUCT_DETAIL = defineGraphql<Gen.ProductDetailQuery, Gen.ProductDetailQueryVariables>()({
    document: Gen.ProductDetailDocument,
    parseKey: "catalog.product",
});
```

### 3. 在组件里查询数据

```tsx
import { useGraphQuery } from "@ldystudio/react-graphql-query";
import { PRODUCT_DETAIL } from "./gql";

export function ProductTitle({ id }: { id: string }) {
    const query = useGraphQuery(PRODUCT_DETAIL, {
        variables: { id },
        enabled: Boolean(id),
    });

    if (query.isPending) return null;
    if (query.isError) return <span>加载失败</span>;

    return <h1>{query.data.title}</h1>;
}
```

`query.data` 是 `parseKey` 指向的数据，所以这个组件拿到的是 `catalog.product`，不是完整 GraphQL 响应。

## 推荐的 Codegen 工作流

长期最省心的方式是：

1. 写 `.graphql` operation 文件。
2. 执行 `react-graphql-query-codegen`。
3. 从 `*.gql.ts` 导入生成好的 `defineGraphql` wrapper。
4. 在业务里使用 `useGraphQuery`、`useGraphMutation` 和缓存辅助函数。

### 安装 codegen 依赖

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/client-preset graphql
```

### 添加脚本

```json
{
    "scripts": {
        "codegen": "react-graphql-query-codegen --config graphql.codegen.ts"
    }
}
```

### 创建 `graphql.codegen.ts`

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

### 示例 `.graphql` 文件

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

### 执行 codegen

```bash
npm run codegen
```

配置 `definitions.output` 后，CLI 会自动追加缺失 wrapper：

```ts
import { defineGraphql } from "@ldystudio/react-graphql-query";
import * as Gen from "../__generated__/main";

export const PRODUCT_DETAIL = defineGraphql<Gen.ProductDetailQuery, Gen.ProductDetailQueryVariables>()({
    document: Gen.ProductDetailDocument,
});
```

definitions 生成器只追加，不覆盖。已有 definition 不会被重写，所以可以安全手动添加 `parseKey`、`key`、业务 root 类型、默认选项或 `client`。

如果某个 target 需要独立 GraphQL client：

```ts
definitions: {
    output: "src/service/gql/secondary.gql.ts",
    client: {
        name: "SecondaryGraphqlClient",
        importPath: "~/service/client",
    },
}
```

更多完整示例：

- [`examples/codegen/config.ts`](./examples/codegen/config.ts)：多 target codegen 配置
- [`examples/codegen/overrides.ts`](./examples/codegen/overrides.ts)：operation type overrides
- [`examples/codegen/GENERATED_STRUCTURE.md`](./examples/codegen/GENERATED_STRUCTURE.md)：生成目录结构和 wrapper 示例

所有示例都使用占位 endpoint、operation 名称和字段路径。

## 核心概念

### Definition

definition 是本库的复用单元。

```ts
const PRODUCT_DETAIL = defineGraphql<Root, Variables>()({
    document,
    parseKey: "catalog.product",
    key: ["catalog", "product-detail"],
    variables: { locale: "zh-CN" },
    staleTime: 60_000,
});
```

常见字段：

- `document`：GraphQL query 或 mutation document。必填。
- `parseKey`：响应解析路径，例如 `catalog.product`。
- `key`：可选缓存身份，和 `parseKey` 解耦。
- `variables`：默认变量，调用方不传时使用。
- `client`：可选 definition 级 `GraphQLClient`。
- TanStack Query 选项，例如 `enabled`、`staleTime`、`gcTime`。

### `parseKey`

`parseKey` 告诉库返回 GraphQL 响应的哪一段。

```ts
parseKey: "catalog.product"
```

这样的响应：

```ts
{
    catalog: {
        product: { id: "p1", title: "Cube" }
    }
}
```

会变成：

```ts
{ id: "p1", title: "Cube" }
```

如果省略 `parseKey`，库会尝试从“只有一条明确选择路径”的 document 里自动推导。显式传入时，以手写值为准。

### `key`

`key` 控制缓存身份。当缓存 key 需要稳定，或不想和响应路径绑定时使用。

```ts
const PRODUCT_LIST = defineGraphql()({
    document: Gen.ProductListDocument,
    parseKey: "catalog.products.nodes",
    key: ["catalog", "product-list"],
});
```

## 查询

### `useGraphQuery`

React 组件里使用。

```ts
const query = useGraphQuery(PRODUCT_DETAIL, {
    variables: { id: "p1" },
});
```

返回 TanStack Query 的 `UseQueryResult`。

### `graphQuery`

React hook 外使用：路由加载、SSR、预取、事件处理、脚本。

```ts
const product = await graphQuery(PRODUCT_DETAIL, {
    client: graphClient,
    variables: { id: "p1" },
});
```

### `graphQueryOptions`

需要直接接入 TanStack Query 时使用。

```ts
const options = graphQueryOptions(PRODUCT_DETAIL, {
    client: graphClient,
    variables: { id: "p1" },
});
```

## Mutation

### 定义 mutation

```ts
export const UPDATE_PRODUCT = defineGraphql<Gen.UpdateProductMutation, Gen.UpdateProductMutationVariables>()({
    document: Gen.UpdateProductDocument,
    parseKey: "catalog.updateProduct",
});
```

### 在 React 里使用

```ts
const mutation = useGraphMutation(UPDATE_PRODUCT);

mutation.mutate({
    id: "p1",
    title: "Updated title",
});
```

Mutation 回调会收到 `GraphMutationContext`，里面有 `client`、`definition` 和 `queryClient`。

### 在 React 外使用

```ts
const product = await graphMutation(UPDATE_PRODUCT, {
    client: graphClient,
    variables: {
        id: "p1",
        title: "Updated title",
    },
});
```

## Infinite Query

建议把 `parseKey` 指向 connection 本身，不要直接指向 `nodes`，这样 `pageInfo` 还在。

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

需要原始 TanStack Query 配置时，用 `graphInfiniteQueryOptions`。

## 缓存辅助函数

缓存辅助函数操作的是解析后的数据，不需要你手动重建 GraphQL root object。

可用函数：

- `queryKeyOf`
- `getGraphData`
- `setGraphData`
- `invalidateGraphQuery`
- `cancelGraphQuery`
- `removeGraphQuery`
- `resetGraphQuery`

乐观更新示例：

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

如果 `setGraphData` 的 updater 返回 `undefined`，已有缓存保持不变；当前 query key 没有缓存时，也不会创建新缓存。

## Client 解析规则

Hook API 的 client 优先级：

1. `definition.client`
2. `options.client`
3. `GraphqlClientProvider` 或 `GraphqlQueryProvider` 里的 provider client

非 hook 辅助函数没有 React provider context，例如 `graphQuery`、`graphQueryOptions`、`graphInfiniteQueryOptions`、`graphMutation`。这些场景要在 definition 或调用 options 里传 `client`。

## 调试 Header

`GraphqlClientProvider` 和 `GraphqlQueryProvider` 可以给 hook 请求加 `x-graph-parse-key`：

```tsx
<GraphqlQueryProvider client={graphClient} queryClient={queryClient} debugParseKeyHeader>
    <App />
</GraphqlQueryProvider>
```

适合在 `graphql-request` middleware 里记录请求。它只影响 provider 下的 hook 请求。

## API 速查

| 任务 | API |
| --- | --- |
| 定义 operation | `defineGraphql` |
| 组件里查询 | `useGraphQuery` |
| React 外查询 | `graphQuery` |
| 生成 TanStack Query 配置 | `graphQueryOptions` |
| 组件里 mutation | `useGraphMutation` |
| React 外 mutation | `graphMutation` |
| 组件里 infinite query | `useInfiniteGraphQuery` |
| 生成 infinite query 配置 | `graphInfiniteQueryOptions` |
| 应用级注入 client | `GraphqlQueryProvider` |
| 读写解析后的缓存 | `getGraphData`, `setGraphData` |

## 限制

- 当前只支持 `graphql-request`。
- 自动 `parseKey` 推导要求 document 只有一个顶层字段。
- 结构分叉或语义不明确时，推导会停在最后一个安全节点。
- `debugParseKeyHeader` 只影响 `GraphqlClientProvider` 或 `GraphqlQueryProvider` 下的 hook 请求。

## License

MIT
