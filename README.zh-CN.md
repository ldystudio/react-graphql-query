# @ldystudio/react-graphql-query

面向 React 和 React Native 的 definition 驱动 GraphQL 查询辅助库，基于 `@tanstack/react-query` 与 `graphql-request`。

[English](./README.md)

## 特性

- 用一个 definition 绑定 `document`、`parseKey`、默认变量、默认查询配置和可选的 `GraphQLClient`
- `useGraphQuery` 和 `graphQuery` 返回解析后的目标数据，而不是整棵 GraphQL 根对象
- 支持从 GraphQL document 保守推导 `parseKey`，也支持手动覆盖
- 通过 `GraphqlClientProvider` 为 Hook 场景提供默认 client

## 安装

```bash
npm install @ldystudio/react-graphql-query @tanstack/react-query graphql graphql-request
```

要求：

- `react >= 18`
- `@tanstack/react-query >= 5`
- `graphql-request >= 6.1.0`

## 快速开始

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GraphQLClient, gql } from "graphql-request";
import {
    GraphqlClientProvider,
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
        <QueryClientProvider client={queryClient}>
            <GraphqlClientProvider client={client}>
                <ProductList />
            </GraphqlClientProvider>
        </QueryClientProvider>
    );
}
```

这个例子里，`query.data` 会被推导为 `Array<{ id: number; title: string }>`，因为根类型和 document 都沿着同一条安全路径 `storefront.featuredProducts.nodes` 收敛。

如果你的应用主要访问同一个 GraphQL endpoint，推荐在组件树外层包一层 `GraphqlClientProvider`，这样组件里通常不需要重复传 `client`。

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

definition 可以包含：

- `document`: 必填，GraphQL 查询或 mutation 文档
- `parseKey`: 可选，响应解析路径，例如 `catalog.product`
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

### `GraphqlClientProvider`

为 Hook 场景提供默认 `GraphQLClient`。

```tsx
<GraphqlClientProvider client={client}>
    <App />
</GraphqlClientProvider>
```

它只影响 `useGraphQuery`。

你也可以开启 `debugParseKeyHeader`，这样 Hook 请求会带上 `x-graph-parse-key`，方便在 `graphql-request` 的 `requestMiddleware` 里打印请求日志。

```tsx
<GraphqlClientProvider client={client} debugParseKeyHeader>
    <App />
</GraphqlClientProvider>
```

`graphQuery` 和 `graphQueryOptions` 不会继承 provider client，也不会继承这个调试 header 开关。

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

`queryKey` 由完整的 `parseKey` 路径和完整的 `variables` 对象组成。

```ts
getGraphQueryKey("catalog.product", { id: 7 });
```

生成结果类似：

```ts
["catalog", "product", { id: 7 }];
```

保留完整变量对象可以避免“值序列相同但语义不同”的请求共享同一个缓存键。

## 导出

运行时导出：

- `defineGraphql`
- `GraphqlClientProvider`
- `useGraphQuery`
- `useGraphqlClient`
- `graphQuery`
- `graphQueryOptions`
- `GRAPH_DEBUG_PARSE_KEY_HEADER`
- `inferGraphParseKey`
- `getGraphParseKey`
- `getGraphLogKey`
- `getGraphQueryKey`
- `getParsePath`
- `getValueByParseKey`
- `createInitialDataByParseKey`

类型导出：

- `GraphqlDefinition`
- `GraphqlDefinitionInput`
- `GraphqlDefinitionParseKey`
- `GraphqlDefinitionRoot`
- `GraphqlClientProviderProps`
- `AnyGraphqlDefinition`
- `GraphParseKey`
- `GraphQueryData`
- `GraphQueryOptions`
- `GraphQueryOptionsResult`
- `GraphValueAtPath`
- `GraphValueByParseKey`
- `UseGraphQueryOptions`

## 限制

- 当前只支持 `graphql-request`
- 自动 `parseKey` 推导要求 document 只有一个顶层字段
- 结构分叉或语义不明确时，推导会停在最后一个安全节点
- `debugParseKeyHeader` 只影响 `GraphqlClientProvider` 下的 Hook 请求

## License

MIT
