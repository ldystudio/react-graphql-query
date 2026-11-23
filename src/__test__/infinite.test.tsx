import { describe, expect, it } from "bun:test";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { GraphQLClient, RequestOptions } from "graphql-request";
import { gql } from "graphql-request";
import type React from "react";
import { cancelGraphQuery, getGraphData, queryKeyOf, setGraphData } from "../cache";
import { defineGraphql } from "../definition";
import { useInfiniteGraphQuery } from "../hooks";
import { graphInfiniteQueryOptions, graphInfiniteQueryOptionsWithRuntime } from "../infinite";
import { GraphqlQueryProvider } from "../provider";
import { GRAPH_DEBUG_KEY_HEADER } from "../query";

function createClient<TData>(
    resolver: (document: unknown, variables: unknown, requestHeaders?: unknown) => TData | Promise<TData>
) {
    return {
        request: async (...args: [unknown] | [unknown, unknown, unknown?]) => {
            if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && "document" in args[0]) {
                const options = args[0] as RequestOptions;

                return resolver(options.document, options.variables, options.requestHeaders);
            }

            const [document, variables, requestHeaders] = args;

            return resolver(document, variables, requestHeaders);
        },
    } as GraphQLClient;
}

describe("无限 GraphQL 查询", () => {
    it.each([
        { name: "省略 gcTime", cache: {} },
        { name: "gcTime 为 undefined", cache: { gcTime: undefined } },
    ])("$name 时在最后一个订阅者卸载后清理缓存，重新进入时只请求首页", async ({ cache }) => {
        type Feed = { catalog: { products: { nodes: string[]; nextPage: string | null } } };
        type Variables = { cursor: string | null };
        const definition = defineGraphql<Feed, Variables>()({
            parseKey: "catalog.products",
            document: gql`
                query ($cursor: String) {
                    catalog {
                        products(cursor: $cursor) {
                            nodes
                            nextPage
                        }
                    }
                }
            `,
        });
        const requests: (string | null)[] = [];
        const client = createClient((_document, variables) => {
            const { cursor } = variables as Variables;
            requests.push(cursor);
            return { catalog: { products: { nodes: [cursor ?? "first"], nextPage: cursor === null ? "next" : null } } };
        });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
        const unrelatedKey = [...queryKeyOf(definition), "other"];
        queryClient.setQueryData(unrelatedKey, "保留");
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlQueryProvider client={client} queryClient={queryClient}>
                {children}
            </GraphqlQueryProvider>
        );
        const useFeed = (enabled = true) =>
            useInfiniteGraphQuery(definition, {
                initialPageParam: null as string | null,
                pageParamToVariables: (cursor) => ({ cursor }),
                getNextPageParam: (page) => page.nextPage,
                staleTime: Infinity,
                enabled,
                ...cache,
            });

        const first = renderHook(() => useFeed(), { wrapper });
        await waitFor(() => expect(first.result.current.data?.pages).toHaveLength(1));
        await act(async () => {
            await first.result.current.fetchNextPage();
        });
        await waitFor(() => expect(first.result.current.data?.pages).toHaveLength(2));
        const second = renderHook(() => useFeed(false), { wrapper });
        expect(second.result.current.data?.pages).toHaveLength(2);

        first.unmount();
        expect(
            queryClient
                .getQueryCache()
                .find({ queryKey: queryKeyOf(definition) })
                ?.getObserversCount()
        ).toBe(1);
        expect(queryClient.getQueryData(queryKeyOf(definition))).toBeDefined();
        second.unmount();
        await waitFor(() => expect(queryClient.getQueryData(queryKeyOf(definition))).toBeUndefined());
        expect(queryClient.getQueryData(unrelatedKey)).toBe("保留");

        const reopened = renderHook(() => useFeed(), { wrapper });
        await waitFor(() => expect(reopened.result.current.data?.pages).toHaveLength(1));
        expect(requests).toEqual([null, "next", null]);
        reopened.unmount();
        queryClient.clear();
    });

    it.each([Infinity, 60_000])("显式设置 gcTime 为 %s 时保留分页缓存", async (gcTime) => {
        const definition = defineGraphql<{ catalog: { products: { nodes: number[] } } }>()({
            parseKey: "catalog.products",
            document: gql`
                query {
                    catalog {
                        products {
                            nodes
                        }
                    }
                }
            `,
        });
        const client = createClient(() => ({ catalog: { products: { nodes: [1] } } }));
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlQueryProvider client={client} queryClient={queryClient}>
                {children}
            </GraphqlQueryProvider>
        );
        const query = renderHook(
            () =>
                useInfiniteGraphQuery(definition, {
                    initialPageParam: null,
                    pageParamToVariables: () => ({}),
                    getNextPageParam: () => undefined,
                    gcTime,
                }),
            { wrapper }
        );
        await waitFor(() => expect(query.result.current.data?.pages).toEqual([{ nodes: [1] }]));

        query.unmount();
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(queryClient.getQueryData(queryKeyOf(definition))).toBeDefined();
        queryClient.clear();
    });

    it("使用 useInfiniteGraphQuery 拉取分页数据", async () => {
        type ProductConnection = {
            catalog: {
                products: {
                    nodes: Array<{ id: number; title: string }>;
                    pageInfo: {
                        endCursor: string | null;
                        hasNextPage: boolean;
                    };
                };
            };
        };

        type ProductVariables = {
            after?: string | null;
            first: number;
        };

        const document = gql`
            query ($first: Int!, $after: String) {
                catalog {
                    products(first: $first, after: $after) {
                        nodes {
                            id
                            title
                        }
                        pageInfo {
                            endCursor
                            hasNextPage
                        }
                    }
                }
            }
        ` as unknown as TypedDocumentNode<ProductConnection, ProductVariables>;

        const definition = defineGraphql({
            document,
            key: ["catalog", "products-connection"],
            parseKey: "catalog.products",
        });
        const requests: ProductVariables[] = [];
        const client = createClient((_document, variables) => {
            const currentVariables = variables as ProductVariables;
            requests.push(currentVariables);

            if (currentVariables.after == null) {
                return {
                    catalog: {
                        products: {
                            nodes: [
                                { id: 1, title: "page-1-a" },
                                { id: 2, title: "page-1-b" },
                            ],
                            pageInfo: {
                                endCursor: "cursor-1",
                                hasNextPage: true,
                            },
                        },
                    },
                };
            }

            return {
                catalog: {
                    products: {
                        nodes: [{ id: 3, title: "page-2-a" }],
                        pageInfo: {
                            endCursor: null,
                            hasNextPage: false,
                        },
                    },
                },
            };
        });
        const queryClient = new QueryClient();
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlQueryProvider client={client} queryClient={queryClient} debugParseKeyHeader>
                {children}
            </GraphqlQueryProvider>
        );

        const { result } = renderHook(
            () =>
                useInfiniteGraphQuery(definition, {
                    variables: { first: 2 },
                    initialPageParam: null as string | null,
                    pageParamToVariables: (pageParam, variables) => ({
                        ...variables,
                        after: pageParam,
                        first: variables?.first ?? 2,
                    }),
                    getNextPageParam: (lastPage) =>
                        lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : undefined,
                    select: (data) => data.pages.flatMap((page) => page.nodes),
                }),
            { wrapper }
        );

        await waitFor(() =>
            expect(result.current.data).toEqual([
                { id: 1, title: "page-1-a" },
                { id: 2, title: "page-1-b" },
            ])
        );

        act(() => {
            setGraphData(
                queryClient,
                definition,
                { first: 2 },
                (data) =>
                    data && {
                        ...data,
                        pages: data.pages.map((page) => ({
                            ...page,
                            nodes: page.nodes.filter((node) => node.id !== 1),
                        })),
                    },
                { kind: "infinite" }
            );
        });

        await waitFor(() => expect(result.current.data).toEqual([{ id: 2, title: "page-1-b" }]));

        act(() => {
            void result.current.fetchNextPage();
        });

        await waitFor(() =>
            expect(result.current.data).toEqual([
                { id: 2, title: "page-1-b" },
                { id: 3, title: "page-2-a" },
            ])
        );
        expect(getGraphData(queryClient, definition, { first: 2 }, { kind: "infinite" })?.pageParams).toEqual([
            null,
            "cursor-1",
        ]);

        expect(requests).toEqual([
            {
                after: null,
                first: 2,
            },
            {
                after: "cursor-1",
                first: 2,
            },
        ]);
    });

    it("构造 infinite query options 时支持 debug header 和上一页参数", async () => {
        type FeedConnection = {
            catalog: {
                products: {
                    nodes: Array<{ id: number }>;
                    pageInfo: {
                        startCursor: string | null;
                        endCursor: string | null;
                    };
                };
            };
        };

        type FeedVariables = {
            after?: string | null;
            before?: string | null;
            first: number;
        };

        let receivedHeaders: unknown;
        let receivedVariables: unknown;
        const client = createClient((_document, variables, requestHeaders) => {
            receivedHeaders = requestHeaders;
            receivedVariables = variables;

            return {
                catalog: {
                    products: {
                        nodes: [{ id: 9 }],
                        pageInfo: {
                            startCursor: "cursor-start",
                            endCursor: "cursor-end",
                        },
                    },
                },
            };
        });
        const definition = defineGraphql<FeedConnection, FeedVariables>()({
            client,
            parseKey: "catalog.products",
            variables: { first: 10 },
            document: gql`
                query ($first: Int!, $after: String, $before: String) {
                    catalog {
                        products(first: $first, after: $after, before: $before) {
                            nodes {
                                id
                            }
                            pageInfo {
                                startCursor
                                endCursor
                            }
                        }
                    }
                }
            `,
        });
        const options = graphInfiniteQueryOptionsWithRuntime(
            definition,
            {
                initialPageParam: "cursor-1",
                pageParamToVariables: (pageParam, variables) => ({
                    ...variables,
                    after: pageParam,
                    first: variables?.first ?? 10,
                }),
                getNextPageParam: (lastPage) => lastPage.pageInfo.endCursor,
                getPreviousPageParam: (firstPage) => firstPage.pageInfo.startCursor,
            },
            {
                debugParseKeyHeader: true,
            }
        );

        const queryFn = options.queryFn as (context: QueryFunctionContext<readonly unknown[], string>) => Promise<{
            nodes: Array<{ id: number }>;
            pageInfo: {
                startCursor: string | null;
                endCursor: string | null;
            };
        }>;
        const result = await queryFn({
            client: new QueryClient(),
            queryKey: options.queryKey,
            meta: undefined,
            pageParam: "cursor-1",
            direction: "forward",
            signal: new AbortController().signal,
        });

        expect(result).toEqual({
            nodes: [{ id: 9 }],
            pageInfo: {
                startCursor: "cursor-start",
                endCursor: "cursor-end",
            },
        });
        expect(receivedHeaders).toEqual({
            [GRAPH_DEBUG_KEY_HEADER]: "catalog-products",
        });
        expect(receivedVariables).toEqual({
            after: "cursor-1",
            first: 10,
        });
        expect(options.gcTime).toBe(0);
        expect(
            options.getPreviousPageParam?.(
                {
                    nodes: [{ id: 9 }],
                    pageInfo: {
                        startCursor: "cursor-start",
                        endCursor: "cursor-end",
                    },
                },
                [],
                "cursor-1",
                []
            )
        ).toBe("cursor-start");
    });

    it("在 infinite query 缺少所有 client 来源时抛错", () => {
        const definition = defineGraphql<{
            catalog: {
                products: {
                    nodes: Array<{ id: number }>;
                };
            };
        }>()({
            parseKey: "catalog.products",
            document: gql`
                query {
                    catalog {
                        products {
                            nodes {
                                id
                            }
                        }
                    }
                }
            `,
        });

        expect(() =>
            graphInfiniteQueryOptionsWithRuntime(definition, {
                initialPageParam: null,
                pageParamToVariables: () => ({}),
                getNextPageParam: () => undefined,
            })
        ).toThrow("GraphQL client is required");
    });

    it("graphInfiniteQueryOptions 委托给 WithRuntime 版本", () => {
        const definition = defineGraphql<{
            catalog: {
                products: {
                    nodes: Array<{ id: number }>;
                };
            };
        }>()({
            client: createClient(() => ({})),
            parseKey: "catalog.products",
            document: gql`
                query {
                    catalog {
                        products {
                            nodes {
                                id
                            }
                        }
                    }
                }
            `,
        });
        const base = {
            initialPageParam: null,
            pageParamToVariables: (pageParam: null) => ({ cursor: pageParam }),
            getNextPageParam: () => undefined,
        };
        const options = graphInfiniteQueryOptions(definition, base);

        expect(options.queryKey).toEqual(["catalog", "products"]);
        expect(options.getNextPageParam).toBeFunction();
        expect(options.queryFn).toBeFunction();
        expect(options.gcTime).toBe(0);
        expect(graphInfiniteQueryOptions(definition, { ...base, gcTime: undefined }).gcTime).toBe(0);
        expect(graphInfiniteQueryOptions(definition, { ...base, gcTime: 60_000 }).gcTime).toBe(60_000);
        expect(graphInfiniteQueryOptions(definition, { ...base, gcTime: Infinity }).gcTime).toBe(Infinity);
    });

    it("非 Hook 查询默认回收缓存，显式配置可保留", async () => {
        const definition = defineGraphql<{ catalog: { products: { nodes: number[] } } }>()({
            client: createClient(() => ({ catalog: { products: { nodes: [1] } } })),
            parseKey: "catalog.products",
            document: gql`
                query {
                    catalog {
                        products {
                            nodes
                        }
                    }
                }
            `,
        });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
        const base = {
            initialPageParam: null,
            pageParamToVariables: () => ({}),
            getNextPageParam: () => undefined,
        };

        const result = await queryClient.ensureInfiniteQueryData(graphInfiniteQueryOptions(definition, base));
        expect(result.pages).toEqual([{ nodes: [1] }]);
        expect(queryClient.getQueryData(queryKeyOf(definition))).toEqual(result);
        await cancelGraphQuery(queryClient, definition);
        setGraphData(
            queryClient,
            definition,
            undefined,
            (current) => current && { ...current, pages: current.pages.map((page) => ({ nodes: [...page.nodes, 2] })) },
            { kind: "infinite" }
        );
        expect(getGraphData(queryClient, definition, undefined, { kind: "infinite" })?.pages).toEqual([
            { nodes: [1, 2] },
        ]);
        await waitFor(() => expect(queryClient.getQueryData(queryKeyOf(definition))).toBeUndefined());

        const retained = await queryClient.fetchInfiniteQuery(
            graphInfiniteQueryOptions(definition, { ...base, gcTime: Infinity })
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(queryClient.getQueryData(queryKeyOf(definition))).toEqual(retained);
        queryClient.clear();
    });
});
