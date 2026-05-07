# react-graphql-query

面向 React 和 React Native 的 definition 驱动 GraphQL 查询辅助库，基于 `@tanstack/react-query` 与 `graphql-request`。

[English](./README.md)

## 特性

- 用一个 definition 绑定 `document`、`parseKey`、默认变量、默认查询配置和可选的 `GraphQLClient`
- 同时支持手写根类型和 `TypedDocumentNode` 驱动的结果/变量类型推导
- 返回解析后的目标数据，而不是整棵 GraphQL 根对象
- 支持从 GraphQL document 保守推导 `parseKey`，也支持手动覆盖
- 通过 `GraphqlClientProvider` 为 Hook 场景提供默认 client，也可通过 `GraphqlQueryProvider` 一次性组合注入 `GraphQLClient` 与 `QueryClient`
- 支持 definition 级可选 `key`，以及 `getGraphData`、`setGraphData`、`invalidateGraphQuery` 这类缓存辅助函数

## 安装

```bash
npm install @ldystudio/react-graphql-query @tanstack/react-query graphql graphql-request
```

要求：

- `react >= 18`
- `@tanstack/react-query >= 5`
- `graphql-request >= 6.1.0`

如果你还想使用库里自带的 GraphQL codegen 辅助能力，应用项目里还需要安装：

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/client-preset graphql
```

## 快速开始

```tsx
import { QueryClient } from "@tanstack/react-query";
import { GraphQLClient, gql } from "graphql-request";
import {
    GraphqlQueryProvider,
    defineGraphql,
    useGraphQuery,
} from "@ldystudio/react-graphql-query";

const client = new GraphQLClient("https://example.com/graphql");
const queryClient = new QueryClient();

interface ProductListRoot {
    storefront: {
        featuredProducts: {
            nodes: Array<{
                id: number;
                title: string;
            }>;
        };
    };
}

const FEATURED_PRODUCTS = defineGraphql<ProductListRoot>()({
    document: gql`
        query {
            storefront {
                featuredProducts {
                    nodes {
                        id
                        title
                    }
                }
            }
        }
    `,
});

function ProductList() {
    const query = useGraphQuery(FEATURED_PRODUCTS);

    if (query.isPending) {
        return null;
    }

    return query.data?.map((product) => product.title).join(", ");
}

export function App() {
    return (
        <GraphqlQueryProvider client={client} queryClient={queryClient}>
            <ProductList />
        </GraphqlQueryProvider>
    );
}
```

这个例子里，`query.data` 会被推导为 `Array<{ id: number; title: string }>`，因为根类型和 document 都沿着同一条安全路径 `storefront.featuredProducts.nodes` 收敛。

如果你的应用主要访问同一个 GraphQL endpoint，推荐在组件树外层包一层 `GraphqlQueryProvider`，这样组件里通常不需要重复传 `client`，Hook 也能自动读取共享的 `QueryClient`。

## GraphQL Codegen

这个包也带了一套轻量 codegen 流程，适合需要这些能力的项目：

- 每个 target 生成一个扁平 `.ts` 文件
- 基于 `client` preset，最终按 `document: Gen.SomeDocument` 使用
- 支持基于 operation document 自动追加 `defineGraphql` 定义文件
- 支持可选的 operation type overrides
- 支持可选的最终源码 transform 和 format 命令

先在应用项目里加脚本：

```json
{
    "scripts": {
        "codegen": "react-graphql-query-codegen --config graphql.codegen.ts"
    }
}
```

然后创建 `graphql.codegen.ts`：

```ts
import { defineGraphqlCodegenProject } from "@ldystudio/react-graphql-query/codegen";

const API_URL = "https://example.com/graphql/v1"

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

执行：

```bash
npm run codegen
```

## 示例

[`examples/codegen`](./examples/codegen) 目录包含匿名化的 GraphQL codegen 示例：

- [`config.ts`](./examples/codegen/config.ts)：带 `definitions.output` 的多 target codegen 配置
- [`overrides.ts`](./examples/codegen/overrides.ts)：占位 operation type override 规则
- [`GENERATED_STRUCTURE.md`](./examples/codegen/GENERATED_STRUCTURE.md)：预期生成目录结构和 wrapper 示例

所有示例都使用占位 endpoint、operation 名称和字段路径。

## 生成后用法

生成后的接入通常长这样：

```ts
import * as Gen from "@/service/__generated__/main";
import { defineGraphql } from "@ldystudio/react-graphql-query";

export const PRODUCT_DETAIL = defineGraphql<Gen.ProductDetailQuery, Gen.ProductDetailVariables>()({
    document: Gen.ProductDetailDocument,
    parseKey: "catalog.product",
});
```

配置 `definitions.output` 后，codegen 还会自动追加缺失的 operation 定义：

```ts
import { defineGraphql } from "@ldystudio/react-graphql-query";
import * as Gen from "../__generated__/main";

export const PRODUCT_DETAIL = defineGraphql<Gen.ProductDetailQuery, Gen.ProductDetailVariables>()({
    document: Gen.ProductDetailDocument,
});
```

已有定义不会被覆盖，所以你可以手动补 `parseKey`、`key`、自定义根类型或其他选项。需要指定独立 GraphQL client 的 target 可以这样写：

```ts
definitions: {
    output: "src/service/gql/pipixia.gql.ts",
    client: {
        name: "Pipixia",
        importPath: "~/service/client",
    },
}
```

### Operation Type Overrides

如果某个 operation 的生成类型里，有一段嵌套路径需要手动替换，可以用 `overrides.operationTypes`：

```ts
import { defineGraphqlCodegenProject } from "@ldystudio/react-graphql-query/codegen";

export default defineGraphqlCodegenProject({
    targets: {
        main: {
            schema: "https://example.com/graphql",
            documents: ["src/service/gql/main.graphql"],
            output: "src/service/__generated__/main.ts",
            overrides: {
                operationTypes: [
                    {
                        operation: "ProductDetailQuery",
                        path: "catalog.product",
                        type: "Product.Detail",
                    },
                ],
            },
        },
    },
});
```

说明：

- overrides 执行顺序是 `prune` 之后、`transformSource` 之前
- 规则里指向“当前 target 不存在的 operation”会被忽略
- 如果 operation 存在，但 `path` 没命中，会抛 `[codegen-overrides]` 错误
- CLI 会故意从应用项目侧加载 `@graphql-codegen/cli`，而不是从本包内部加载，避免 `graphql` 多实例问题

## 核心 API

### `defineGraphql`

定义一个可复用的 GraphQL definition。

```ts
const PRODUCT_DETAIL = defineGraphql<{
    catalog: {
        product: {
            id: number;
            title: string;
        };
    };
}>()({
    document: gql`
        query ($id: Int!) {
            catalog {
                product(id: $id) {
                    id
                    title
                }
            }
        }
    `,
});
```

它也支持直接接收 `TypedDocumentNode`，这样可以从生成的 GraphQL document 自动推导结果类型和变量类型。

```ts
import { ProductDocument } from "./__generated__/graphql";

const PRODUCT_DETAIL = defineGraphql()({
    document: ProductDocument,
    parseKey: "catalog.product",
    key: ["catalog", "product-detail"],
});
```

这里的 `ProductDocument` 必须是一个真实存在的运行时值，通常来自 GraphQL codegen 生成的 document 常量。`declare const ...` 只能用于类型演示，不能直接放进业务代码执行。

definition 可以包含：

- `document`: 必填，GraphQL 查询或 mutation 文档
- `parseKey`: 可选，响应解析路径，例如 `catalog.product`
- `key`: 可选，缓存身份，和 `parseKey` 分离
- `variables`: 可选，默认变量
- `client`: 可选，绑定在 definition 上的 `GraphQLClient`
- React Query 选项，例如 `staleTime`、`gcTime`、`enabled`

### `useGraphQuery`

在 React 组件里执行 definition。

```ts
const query = useGraphQuery(PRODUCT_DETAIL, {
    variables: { id: 7 },
});
```

它内部调用 `useQuery(graphQueryOptions(...))`，返回标准 `UseQueryResult`。

如果当前组件树被 `GraphqlClientProvider` 包裹，且 definition 和 hook options 都没有显式传 `client`，`useGraphQuery` 会自动使用 provider 中的 client。

### `GraphqlQueryProvider`

一次性提供 `GraphQLClient` 和 `QueryClient`。

```tsx
<GraphqlQueryProvider client={client} queryClient={queryClient}>
    <App />
</GraphqlQueryProvider>
```

这是更推荐的应用级 provider。它内部组合了 `QueryClientProvider` 和 `GraphqlClientProvider`。

### `GraphqlClientProvider`

为 Hook 场景提供默认 `GraphQLClient`。

```tsx
<GraphqlClientProvider client={client}>
    <App />
</GraphqlClientProvider>
```

它会给本库的所有 Hook API 提供默认 `GraphQLClient`，包括 `useGraphQuery`、`useInfiniteGraphQuery` 和 `useGraphMutation`。

你也可以开启 `debugParseKeyHeader`，这样 Hook 请求会带上 `x-graph-parse-key`，方便在 `graphql-request` 的 `requestMiddleware` 里打印请求日志。

```tsx
<GraphqlClientProvider client={client} debugParseKeyHeader>
    <App />
</GraphqlClientProvider>
```

`graphQuery`、`graphQueryOptions`、`graphInfiniteQueryOptions` 和 `graphMutation` 都不会继承 provider client，也不会继承这个调试 header 开关。

### `useGraphMutation`

在 React 组件里执行解析后的 mutation。

```ts
const updateProduct = useGraphMutation(UPDATE_PRODUCT);

updateProduct.mutate({
    id: 7,
    title: "Updated title",
});
```

它内部基于 TanStack Query 的 `useMutation`，并会自动从 `GraphqlQueryProvider` 或 `QueryClientProvider` 读取共享的 `QueryClient`。

`onMutate`、`onSuccess`、`onError`、`onSettled` 这些 mutation 回调还会额外收到库层的 `GraphMutationContext`，其中包含 `client`、`definition` 和 `queryClient`。

### `graphMutation`

在非 Hook 场景直接执行解析后的 mutation。

```ts
const product = await graphMutation(UPDATE_PRODUCT, {
    client,
    variables: {
        id: 7,
        title: "Updated title",
    },
});
```

### `useInfiniteGraphQuery`

在 React 组件里执行解析后的 infinite query。

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

对于 cursor 分页，通常更适合把 `parseKey` 指向 connection 本身，例如 `catalog.products`，而不是直接指向 `nodes`，这样 `pageInfo` 还在。

### `graphInfiniteQueryOptions`

生成标准 TanStack Query infinite query 配置对象。

```ts
const options = graphInfiniteQueryOptions(PRODUCT_CONNECTION, {
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

### `graphQuery`

在非 Hook 场景直接获取解析后的数据。

```ts
import { QueryClient } from "@tanstack/react-query";
import { graphQuery } from "@ldystudio/react-graphql-query";

const queryClient = new QueryClient();

const product = await graphQuery(PRODUCT_DETAIL, {
    client,
    queryClient,
    variables: { id: 7 },
});
```

适合预取、路由加载、SSR 或事件流里取数。

### `graphQueryOptions`

生成标准 TanStack Query 配置对象。

```ts
const options = graphQueryOptions(PRODUCT_DETAIL, {
    client,
    variables: { id: 7 },
});
```

可以配合 `useQuery`、`prefetchQuery` 或其他 TanStack Query API 使用。

## 缓存辅助函数

definition 级缓存 helper 让你直接操作 parse 后的数据，而不用手动回填 GraphQL root shape。

`setGraphData` 会沿着 `parseKey` 回写，只更新解析出来的那一段数据，同时保留原始 GraphQL root object 上的 sibling fields。

如果 updater 返回 `undefined`，这个 helper 不会删除已有缓存；已有缓存会保持不变，而当当前 query key 不存在时，它也不会创建新的缓存条目。

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

## `parseKey` 推导

默认情况下，库会从 document 中自动推导 `parseKey`。

```graphql
query {
    storefront {
        featuredProducts {
            nodes {
                id
            }
        }
    }
}
```

上面会推导出：

```ts
"storefront.featuredProducts.nodes";
```

推导规则是保守的：

- 只有当每一层都只有一个选中字段时才会继续向下
- 运行时解析和类型推导都会停在最后一个无歧义节点
- 遇到不透明包装值、分叉结构或歧义选择时，不会继续收窄

如果你需要显式路径，可以手动传 `parseKey`：

```ts
const PRODUCT_DETAIL = defineGraphql<Root>()({
    parseKey: "catalog.product",
    document: gql`
        query ($id: Int!) {
            catalog {
                product(id: $id) {
                    id
                    title
                }
            }
        }
    `,
});
```

显式传入时，以手写值为准。

## `client` 优先级

`GraphQLClient` 有三个来源：

1. `definition.client`
2. `options.client`
3. `GraphqlClientProvider`

优先级如下：

1. `definition.client`
2. `options.client`
3. provider client

如果三者都没有，会抛错。

## `queryKey` 生成规则

默认情况下，`queryKey` 由完整的 `parseKey` 路径和完整的 `variables` 对象组成。

```ts
getGraphQueryKey("catalog.product", { id: 7 });
```

生成结果类似：

```ts
["catalog", "product", { id: 7 }];
```

保留完整变量对象可以避免“值序列相同但语义不同”的请求共享同一个缓存键。

如果你希望缓存身份更显式，可以在 definition 上提供 `key`：

```ts
const PRODUCT_LIST = defineGraphql()({
    document: ProductListDocument,
    parseKey: "catalog.products.nodes",
    key: ["catalog", "product-list"],
});
```

这会生成类似下面的 query key：

```ts
["catalog", "product-list", { first: 20 }];
```

## 限制

- 当前只支持 `graphql-request`
- 自动 `parseKey` 推导要求 document 只有一个顶层字段
- 结构分叉或语义不明确时，推导会停在最后一个安全节点
- `debugParseKeyHeader` 只影响 `GraphqlClientProvider` 或 `GraphqlQueryProvider` 下的 Hook 请求

## License

MIT
