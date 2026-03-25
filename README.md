# @ldystudio/react-graphql-query

面向 React 和 React Native 的轻量 GraphQL 查询封装，基于 `@tanstack/react-query` 与 `graphql-request`。  
A lightweight GraphQL query wrapper for React and React Native, built on top of `@tanstack/react-query` and `graphql-request`.

它用一个 definition 对象把 `document`、`parseKey`、默认变量、默认查询配置和可选的 `GraphQLClient` 绑定在一起。  
It uses a single definition object to bind `document`, `parseKey`, default variables, default query options, and an optional `GraphQLClient`.

## 特性 / Features

- `parseKey` 可自动从 GraphQL document 推导，也支持手动覆盖  
  `parseKey` can be inferred from the GraphQL document and can also be overridden manually
- `useGraphQuery` 返回解析后的目标数据，而不是整棵 GraphQL 根对象  
  `useGraphQuery` returns parsed target data instead of the full GraphQL root object
- `graphQuery` 可直接和 `QueryClient` 配合使用，适合预取、SSR、事件流里调用  
  `graphQuery` works directly with `QueryClient`, which is useful for prefetching, SSR, and event-driven flows
- `definition.client` 优先级高于运行时传入的 `client`  
  `definition.client` takes priority over the runtime `client`
- 同时适用于 React Web 和 React Native  
  Works in both React Web and React Native

## 安装 / Installation

```bash
npm install @ldystudio/react-graphql-query @tanstack/react-query graphql graphql-request
```

要求：  
Requirements:

- `react >= 18`
- `@tanstack/react-query >= 5`
- `graphql-request = 6.1.0`

## 快速开始 / Quick Start

```ts
import { GraphQLClient, gql } from "graphql-request";
import {
    defineGraphql,
    GraphqlClientProvider,
    useGraphQuery,
} from "@ldystudio/react-graphql-query";

const client = new GraphQLClient("https://example.com/graphql");

type ItemListRoot = {
    catalog: {
        items: {
            nodes: Array<{
                id: number;
                title: string;
            }>;
        };
    };
};

const ITEM_LIST = defineGraphql<ItemListRoot>()({
    document: gql`
        query {
            catalog {
                items {
                    nodes {
                        id
                        title
                    }
                }
            }
        }
    `,
});

function ItemList() {
    const query = useGraphQuery(ITEM_LIST);

    if (query.isPending) {
        return null;
    }

    return query.data?.map((item) => item.title).join(", ");
}

function App() {
    return (
        <GraphqlClientProvider client={client}>
            <ItemList />
        </GraphqlClientProvider>
    );
}
```

如果你的应用主要连接同一个 GraphQL endpoint，推荐在应用根部使用 `GraphqlClientProvider`，这样组件里的 `useGraphQuery` 通常就不需要重复传 `client`。  
If your app mainly talks to a single GraphQL endpoint, wrap the app with `GraphqlClientProvider` so `useGraphQuery` usually does not need a repeated `client` option.

上面的 `query.data` 类型会自动推导为 `Array<{ id: number; title: string }>`，因为默认会从 document 推导出 `parseKey = "catalog.items.nodes"`。  
In the example above, `query.data` is automatically inferred as `Array<{ id: number; title: string }>` because the library infers `parseKey = "catalog.items.nodes"` from the document.

## 核心概念 / Core Concepts

### `defineGraphql`

定义一个可复用的 GraphQL definition。  
Defines a reusable GraphQL definition.

```ts
const definition = defineGraphql<RootType>()({
    document: gql`
        query ($id: Int!) {
            ugc {
                detail(id: $id) {
                    id
                    title
                }
            }
        }
    `,
});
```

definition 可以包含这些字段：  
A definition can include these fields:

- `document`: 必填，GraphQL 查询或 mutation 文档  
  `document`: required GraphQL query or mutation document
- `parseKey`: 可选，响应解析路径，例如 `ugc.detail`  
  `parseKey`: optional response parsing path, such as `ugc.detail`
- `variables`: 可选，默认变量  
  `variables`: optional default variables
- `client`: 可选，绑定在 definition 上的 `GraphQLClient`  
  `client`: optional `GraphQLClient` bound to the definition
- 其他 React Query 选项，例如 `staleTime`、`gcTime`、`enabled`  
  Other React Query options such as `staleTime`, `gcTime`, and `enabled`

### `useGraphQuery`

在 React 组件里发起请求。  
Runs a request inside React components.

```ts
const query = useGraphQuery(USER_PROFILE, {
    variables: { id: 7 },
});
```

它内部调用 `useQuery(graphQueryOptions(...))`，返回值就是标准的 `UseQueryResult`。  
Internally it calls `useQuery(graphQueryOptions(...))`, and the return value is a standard `UseQueryResult`.

如果当前组件树被 `GraphqlClientProvider` 包裹，且 definition 和 options 都没有显式传 `client`，`useGraphQuery` 会自动使用 provider 里的 client。  
If the current component tree is wrapped by `GraphqlClientProvider`, and neither the definition nor the options provide a `client`, `useGraphQuery` will use the provider client automatically.

### `GraphqlClientProvider`

给 React 组件树提供默认的 `GraphQLClient`。  
Provides a default `GraphQLClient` for a React component tree.

```ts
<GraphqlClientProvider client={client}>
    <App />
</GraphqlClientProvider>
```

它只影响 Hook 场景中的 `useGraphQuery`。  
It only affects hook-based usage through `useGraphQuery`.

`graphQuery` 和 `graphQueryOptions` 仍然保持显式传入 `client` 的模式。  
`graphQuery` and `graphQueryOptions` still keep the explicit `client` pattern.

### `graphQuery`

在非 Hook 场景直接获取数据。  
Fetches data directly in non-hook scenarios.

```ts
import { QueryClient } from "@tanstack/react-query";
import { graphQuery } from "@ldystudio/react-graphql-query";

const queryClient = new QueryClient();

const detail = await graphQuery(UGC_DETAIL, {
    client,
    queryClient,
    variables: { id: 7 },
});
```

适合这些场景：  
Useful for:

- 预取数据  
  prefetching
- 服务端或路由加载器里取数  
  server-side or route-loader data fetching
- 提交后手动刷新某段数据前，先拉取最新值  
  fetching the latest value before a manual refresh after a submit action

### `graphQueryOptions`

如果你想自己调用 `useQuery`、`prefetchQuery` 或其他 React Query API，可以先拿到标准配置对象。  
If you want to call `useQuery`, `prefetchQuery`, or other React Query APIs yourself, you can get a standard query options object first.

```ts
const options = graphQueryOptions(UGC_DETAIL, {
    client,
    variables: { id: 7 },
});
```

## `parseKey` 自动推导与手动指定 / `parseKey` Inference and Manual Override

默认情况下，库会从 document 中自动推导 `parseKey`。  
By default, the library infers `parseKey` from the document.

例如：  
For example:

```graphql
query {
    catalog {
        items {
            nodes {
                id
            }
        }
    }
}
```

会推导出：  
This is inferred as:

```ts
"catalog.items.nodes";
```

自动推导的规则比较保守：只有在每一层都只有一个字段并且还能继续向下收敛时，才会继续深入。  
The inference is intentionally conservative: it only keeps drilling down while each level has exactly one field and the path remains unambiguous.

如果你希望显式指定路径，或者 document 的结构不适合自动推导，可以手动传入 `parseKey`：  
If you want an explicit path, or if your document structure is not suitable for inference, you can pass `parseKey` manually:

```ts
const definition = defineGraphql<Root>()({
    parseKey: "ugc.detail",
    document: gql`
        query ($id: Int!) {
            ugc {
                detail(id: $id) {
                    id
                    title
                }
            }
        }
    `,
});
```

手动传入时，手写值优先。  
When provided manually, the explicit value wins.

## `client` 优先级 / `client` Priority

你可以把 `GraphQLClient` 放在 definition 上，也可以在调用时传入。  
You can attach a `GraphQLClient` to the definition or pass one at call time.

优先级如下：  
Priority order:

1. `definition.client`
2. `options.client`
3. `provider client` from `GraphqlClientProvider`

如果三者都没提供，会抛错。  
If none of the three is available, the library throws an error.

## `queryKey` 生成规则 / `queryKey` Generation

`queryKey` 由 `parseKey` 和 `variables` 生成。  
`queryKey` is generated from `parseKey` and `variables`.

例如：  
For example:

```ts
getGraphQueryKey(UGC_DETAIL, { id: 7 });
```

会得到：  
This produces:

```ts
["ugc", "detail", 7];
```

如果没有变量，则只使用 `parseKey` 路径。  
If there are no variables, only the `parseKey` path is used.

## 导出 API / Exported API

运行时导出：  
Runtime exports:

- `defineGraphql`
- `GraphqlClientProvider`
- `useGraphQuery`
- `useGraphqlClient`
- `graphQuery`
- `graphQueryOptions`
- `inferGraphParseKey`
- `getGraphParseKey`
- `getGraphLogKey`
- `getGraphQueryKey`
- `getParsePath`
- `getValueByParseKey`
- `createInitialDataByParseKey`

类型导出：  
Type exports:

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

## React 与 React Native / React and React Native

这个库不依赖 DOM，也不依赖 React Native 专属 API。  
This library does not depend on the DOM or any React Native specific API.

只要你的项目里满足这些条件，就可以使用：  
You can use it as long as your project has:

- React
- `@tanstack/react-query`
- `graphql-request`
- 一个可用的 `GraphQLClient`

## 限制 / Limitations

- 当前只封装 `graphql-request` 方案  
  Only `graphql-request` is supported today
- 自动 `parseKey` 推导要求 document 只有一个顶层字段  
  Automatic `parseKey` inference requires the document to have exactly one top-level field
- 如果查询结构在某一层分叉，自动推导会停在最后一个明确节点  
  If the query structure branches at some level, inference stops at the last unambiguous node

## License

MIT
