import { describe, expect, it } from "bun:test";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { GraphQLClient, RequestOptions } from "graphql-request";
import { gql } from "graphql-request";
import type React from "react";
import { defineGraphql } from "../definition";
import { useInfiniteGraphQuery } from "../hooks";
import { graphInfiniteQueryOptionsWithRuntime } from "../infinite";
import { GraphqlQueryProvider } from "../provider";
import { GRAPH_DEBUG_PARSE_KEY_HEADER } from "../query";

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
            void result.current.fetchNextPage();
        });

        await waitFor(() =>
            expect(result.current.data).toEqual([
                { id: 1, title: "page-1-a" },
                { id: 2, title: "page-1-b" },
                { id: 3, title: "page-2-a" },
            ])
        );

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
            [GRAPH_DEBUG_PARSE_KEY_HEADER]: "catalog.products",
        });
        expect(receivedVariables).toEqual({
            after: "cursor-1",
            first: 10,
        });
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
});
