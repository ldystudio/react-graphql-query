# react-graphql-query

面向 React 和 React Native 的 definition 驱动 GraphQL 查询辅助库。它把 `graphql-request`、`@tanstack/react-query`、类型化 GraphQL Document、响应解析和缓存辅助能力组合在一个可复用的 definition 里。

[English](./README.md)

## 你会得到什么

- 用 `defineGraphql` 只定义一次 GraphQL operation。
- 同一个 definition 可用于 hooks、非 hook 请求、mutation、infinite query 和缓存辅助函数。
- 直接读取解析后的数据，例如 `catalog.product`，不用每次处理完整 GraphQL root object。
- 可从 `TypedDocumentNode` 推导返回类型和变量类型，也支持手写 root 类型。
- 通过 `GraphqlQueryProvider` 提供共享 `GraphQLClient`。
- 使用 `graphql-transport-ws` 订阅推送，并按需更新查询缓存。
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

## Subscription

创建一次订阅 client，并在各端的 Provider 中注入。地址和 `connectionParams` 应符合服务端约定；使用函数可在每次连接时读取最新凭据。

```tsx
import { createGraphqlSubscriptionClient, GraphqlQueryProvider } from "@ldystudio/react-graphql-query";

const subscriptionClient = createGraphqlSubscriptionClient({
    url: "wss://example.com/graphql",
    connectionParams: () => ({ token: getToken() }),
});

<GraphqlQueryProvider client={graphClient} queryClient={queryClient} subscriptionClient={subscriptionClient}>
    <App />
</GraphqlQueryProvider>;
```

订阅 definition 与查询一样可以由 codegen 生成。每条事件会执行 `onData`，也可以通过 `cache` 更新一个查询的解析后数据：

```tsx
import { gql } from "graphql-request";
import { defineGraphql, useGraphSubscription } from "@ldystudio/react-graphql-query";

type Message = { id: string; text: string };
const MESSAGES = defineGraphql<{ messages: Message[] }, { roomId: string }>()({
    document: gql`query Messages($roomId: ID!) { messages(roomId: $roomId) { id text } }`,
});
const MESSAGE_ADDED = defineGraphql<{ messageAdded: Message }, { roomId: string }>()({
    document: gql`subscription MessageAdded($roomId: ID!) { messageAdded(roomId: $roomId) { id text } }`,
});

function MessageEvents({ roomId }: { roomId: string }) {
    const { status, error } = useGraphSubscription(MESSAGE_ADDED, {
        variables: { roomId },
        onData: (message) => console.log(message),
        cache: {
            query: MESSAGES,
            queryVariables: { roomId },
            update: (current, message) => [...(current ?? []), message],
        },
    });
    return <span>{error?.message ?? status}</span>;
}
```

- 连接按需建立并由多个订阅共享；最后一个订阅取消后关闭。变量变化、禁用或组件卸载会取消旧订阅。
- 默认在网络断开后持续退避重连；不可恢复的协议错误（如 4401）通过 `error` 返回。状态为 `idle`、`connecting`、`connected`、`complete` 或 `error`。
- `options.client` 优先于 Provider 的 `subscriptionClient`。客户端必须在支持 WebSocket 的运行时创建；Web SSR 应避免在服务端创建。
- `connectionParams` 只在建立或重建连接时读取；凭据变化时可调用 `subscriptionClient.terminate()` 触发重连。
- `cache.update` 返回 `undefined` 时不写入缓存；进行中的查询仍可能在完成后覆盖订阅写入，应由业务协调初始查询和订阅时序。

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
- `parseKey`：响应解析路径，例如 `catalog.product`；传 `""` 时返回完整 root 响应。
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

当一个 operation 有意读取多个顶层字段，且调用方需要完整 root object 时，可以使用空 `parseKey`：

```ts
const DASHBOARD = defineGraphql()({
    document: Gen.DashboardDocument,
    parseKey: "",
    key: ["dashboard"],
});
```

这时 `query.data` 是完整响应，例如 `{ notifications, accountSummary }`。

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

### 乐观更新

给 `useGraphMutation` 传 `optimisticUpdate`，可以立即把变更应用到目标 query 的缓存，mutation 失败时自动恢复原值：

```ts
const mutation = useGraphMutation<
    typeof UPDATE_PRODUCT,
    unknown,
    unknown,
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

- `getOptimisticState` 接收当前解析数据（`currentData`）和 mutation 的 `variables`，返回下一个缓存值；返回 `undefined` 表示不改动缓存。
- 失败时自动恢复原值；成功时（`invalidateQueryOnSuccess` 默认为 `false`）乐观值保留在缓存里，设为 `true` 则触发重新拉取。
- 目标是 infinite query 时，用 `kind: "infinite"` 并传 `queryVariables`。
- 数据类型从 `query` 定义自动推导，调用方无需手写 `GraphQueryData<...>`。

乐观更新的设计灵感来自 [`tanstack-query-optimistic-updates`](https://github.com/mugglim/tanstack-query-optimistic-updates)。

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

`useInfiniteGraphQuery` 和 `graphInfiniteQueryOptions` 默认设置 `gcTime: 0`，会覆盖 QueryClient 的默认值。没有订阅者的缓存会被异步回收；最后一个订阅者卸载、缓存回收后，重新进入将从首页开始。没有订阅者的非 Hook 请求或预取，完成后缓存也可能被回收。需要保留分页缓存时可显式传入 `gcTime`，例如服务端渲染时传入 `Infinity`。TanStack Query 对同一 key 采用最长的 `gcTime`，已有较长生命周期的缓存可能继续保留；已挂载但禁用的订阅者也会阻止回收。

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

无限查询传入 `{ kind: "infinite" }` 后，可以读取或更新完整分页缓存。每一页都是解析后的数据；更新时要保留 `pageParams`：

```ts
const variables = { first: 20 };
const previous = getGraphData(queryClient, PRODUCT_CONNECTION, variables, { kind: "infinite" });

setGraphData(queryClient, PRODUCT_CONNECTION, variables, (current) =>
    current && {
        ...current,
        pages: current.pages.map((page) => ({
            ...page,
            nodes: page.nodes.filter((node) => node.id !== 1),
        })),
    },
    { kind: "infinite" }
);
```

分页参数的类型默认为 `unknown`；需要指定游标类型时，可使用 `getGraphData<typeof PRODUCT_CONNECTION, string | null>(...)` 或 `setGraphData<typeof PRODUCT_CONNECTION, string | null>(...)`。

做乐观更新时，优先使用 `useGraphMutation` 的 `optimisticUpdate` 选项（见 [乐观更新](#乐观更新)），它自动处理取消、快照、回滚和失效。需要更底层的控制时，再直接使用缓存辅助函数，例如：

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
| 组件里 subscription | `createGraphqlSubscriptionClient`, `useGraphSubscription` |
| React 外 mutation | `graphMutation` |
| 组件里 infinite query | `useInfiniteGraphQuery` |
| 生成 infinite query 配置 | `graphInfiniteQueryOptions` |
| 应用级注入 client | `GraphqlQueryProvider` |
| 读写解析后的缓存 | `getGraphData`, `setGraphData` |

## 限制

- 查询和 mutation 使用 `graphql-request`；subscription 使用 `graphql-transport-ws`。
- 自动 `parseKey` 推导只适用于 document 只有一个顶层字段的情况。需要多个顶层字段的完整 root 响应时，请使用 `parseKey: ""`。
- 嵌套 selection 分叉或语义不明确时，推导会停在最后一个安全 object 节点。
- `debugParseKeyHeader` 只影响 `GraphqlClientProvider` 或 `GraphqlQueryProvider` 下的 hook 请求。

## License

MIT
