import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { GraphQLClient, RequestOptions } from "graphql-request";
import { gql } from "graphql-request";
import type React from "react";
import { defineGraphql } from "../definition";
import { useGraphQuery } from "../hooks";
import { getGraphQueryKey } from "../key";
import { GraphqlClientProvider, GraphqlQueryProvider } from "../provider";
import { GRAPH_DEBUG_PARSE_KEY_HEADER, graphQuery, graphQueryOptions } from "../query";

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

describe("GraphQL 查询", () => {
    it("使用 graphQuery 获取解析后的数据", async () => {
        const queryClient = new QueryClient();
        const client = createClient(() => ({
            storefront: {
                featuredProducts: {
                    nodes: [{ id: 1 }, { id: 2 }],
                },
            },
        }));
        const definition = defineGraphql<{ storefront: { featuredProducts: { nodes: Array<{ id: number }> } } }>()({
            parseKey: "storefront.featuredProducts.nodes",
            document: gql`
                query {
                    storefront {
                        featuredProducts {
                            nodes {
                                id
                            }
                        }
                    }
                }
            `,
        });

        const data = await graphQuery(definition, {
            client,
            queryClient,
        });

        expect(data).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("优先使用 definition.client 而不是 options.client", async () => {
        const queryClient = new QueryClient();
        const definitionClient = createClient(() => ({
            session: {
                authToken: {
                    value: "definition",
                },
            },
        }));
        const optionsClient = createClient(() => ({
            session: {
                authToken: {
                    value: "options",
                },
            },
        }));
        const definition = defineGraphql<{ session: { authToken: { value: string } } }>()({
            client: definitionClient,
            document: gql`
                mutation {
                    session {
                        authToken {
                            value
                        }
                    }
                }
            `,
        });

        const data = await graphQuery(definition, {
            client: optionsClient,
            queryClient,
        });

        expect(data).toEqual({
            value: "definition",
        });
    });

    it("将 definition 的 query 默认值合并到 graphQueryOptions", () => {
        const client = createClient(() => ({
            session: {
                revoke: {
                    ok: true,
                },
            },
        }));
        const definition = defineGraphql<{ session: { revoke: { ok: boolean } } }>()({
            client,
            staleTime: 5000,
            document: gql`
                mutation {
                    session {
                        revoke {
                            ok
                        }
                    }
                }
            `,
        });

        const options = graphQueryOptions(definition);

        expect(options.staleTime).toBe(5000);
    });

    it("将 initialData 包装为根结构并通过 select 转换数据", () => {
        const client = createClient(() => ({
            catalog: {
                products: {
                    nodes: [],
                },
            },
        }));
        const definition = defineGraphql<{
            catalog: {
                products: {
                    nodes: Array<{ id: number; title: string }>;
                };
            };
        }>()({
            client,
            parseKey: "catalog.products.nodes",
            document: gql`
                query {
                    catalog {
                        products {
                            nodes {
                                id
                                title
                            }
                        }
                    }
                }
            `,
        });

        const options = graphQueryOptions(definition, {
            initialData: [
                { id: 1, title: "initial" },
                { id: 2, title: "data" },
            ],
            select: (data) => data.map((item) => item.title),
        });

        expect(options.initialData).toEqual({
            catalog: {
                products: {
                    nodes: [
                        { id: 1, title: "initial" },
                        { id: 2, title: "data" },
                    ],
                },
            },
        });
        expect(
            options.select?.({
                catalog: {
                    products: {
                        nodes: [
                            { id: 1, title: "a" },
                            { id: 2, title: "b" },
                        ],
                    },
                },
            })
        ).toEqual(["a", "b"]);
    });

    it("在未传入 variables 时使用 definition 默认变量，并允许调用时覆盖", async () => {
        const queryClient = new QueryClient();
        const receivedVariables: Array<unknown> = [];
        const client = createClient((_document, variables) => {
            receivedVariables.push(variables);

            return {
                catalog: {
                    product: {
                        id: (variables as { id: number }).id,
                    },
                },
            };
        });
        const definition = defineGraphql<
            {
                catalog: {
                    product: {
                        id: number;
                    };
                };
            },
            {
                id: number;
            }
        >()({
            client,
            parseKey: "catalog.product",
            variables: { id: 1 },
            document: gql`
                query ($id: Int!) {
                    catalog {
                        product(id: $id) {
                            id
                        }
                    }
                }
            `,
        });

        const defaultData = await graphQuery(definition, {
            queryClient,
        } as never);
        const overriddenData = await graphQuery(definition, {
            queryClient,
            variables: { id: 2 },
        });

        expect(defaultData).toEqual({ id: 1 });
        expect(overriddenData).toEqual({ id: 2 });
        expect(receivedVariables).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("在 query key 中保留变量名以避免冲突", () => {
        expect(getGraphQueryKey("catalog.product", { id: 1, mode: "full" })).not.toEqual(
            getGraphQueryKey("catalog.product", { page: 1, status: "full" })
        );
        expect(getGraphQueryKey("catalog.product", { id: 1, mode: "full" })).toEqual(
            getGraphQueryKey("catalog.product", { mode: "full", id: 1 })
        );
    });

    it("透传 requestHeaders 且不泄漏 parseKey", async () => {
        const queryClient = new QueryClient();
        let receivedHeaders: unknown;
        const client = createClient((_document, _variables, requestHeaders) => {
            receivedHeaders = requestHeaders;

            return {
                user: {
                    profile: {
                        id: 1,
                    },
                },
            };
        });
        const definition = defineGraphql<{ user: { profile: { id: number } } }>()({
            parseKey: "user.profile",
            document: gql`
                query {
                    user {
                        profile {
                            id
                        }
                    }
                }
            `,
        });

        await graphQuery(definition, {
            client,
            queryClient,
            requestHeaders: {
                authorization: "Bearer token",
            },
        });

        expect(receivedHeaders).toEqual({
            authorization: "Bearer token",
        });
    });

    it("当 provider 启用 debugParseKeyHeader 时添加 x-graph-parse-key", async () => {
        const queryClient = new QueryClient();
        let receivedHeaders: unknown;
        const providerClient = createClient((_document, variables, requestHeaders) => {
            receivedHeaders = requestHeaders;

            return {
                user: {
                    profile: {
                        id: (variables as { id: number }).id,
                        name: "provider",
                    },
                },
            };
        });
        const definition = defineGraphql<{ user: { profile: { id: number; name: string } } }>()({
            parseKey: "user.profile",
            document: gql`
                query ($id: Int!) {
                    user {
                        profile(id: $id) {
                            id
                            name
                        }
                    }
                }
            `,
        });
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>
                <GraphqlClientProvider client={providerClient} debugParseKeyHeader>
                    {children}
                </GraphqlClientProvider>
            </QueryClientProvider>
        );

        const { result } = renderHook(
            () =>
                useGraphQuery(definition, {
                    variables: { id: 3 },
                    requestHeaders: {
                        authorization: "Bearer token",
                    },
                }),
            { wrapper }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(receivedHeaders).toEqual({
            authorization: "Bearer token",
            [GRAPH_DEBUG_PARSE_KEY_HEADER]: "user.profile",
        });
    });

    it("当 graphQuery 缺少所有 client 来源时抛错", async () => {
        const definition = defineGraphql<{ user: { profile: { id: number } } }>()({
            parseKey: "user.profile",
            document: gql`
                query {
                    user {
                        profile {
                            id
                        }
                    }
                }
            `,
        });

        await expect(
            graphQuery(definition, {
                queryClient: new QueryClient(),
            } as never)
        ).rejects.toThrow("GraphQL client is required");
    });

    it("在 QueryClientProvider 内使用 useGraphQuery", async () => {
        const queryClient = new QueryClient();
        const client = createClient((_document, variables) => ({
            catalog: {
                product: {
                    id: (variables as { id: number }).id,
                    title: "hello",
                },
            },
        }));
        const definition = defineGraphql<{ catalog: { product: { id: number; title: string } } }>()({
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
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );

        const { result } = renderHook(
            () =>
                useGraphQuery(definition, {
                    client,
                    variables: { id: 7 },
                }),
            { wrapper }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(result.current.data).toEqual({
            id: 7,
            title: "hello",
        });
    });

    it("省略 options.client 时使用 provider 的 client", async () => {
        const queryClient = new QueryClient();
        const providerClient = createClient((_document, variables) => ({
            user: {
                profile: {
                    id: (variables as { id: number }).id,
                    name: "provider",
                },
            },
        }));
        const definition = defineGraphql<{ user: { profile: { id: number; name: string } } }>()({
            document: gql`
                query ($id: Int!) {
                    user {
                        profile(id: $id) {
                            id
                            name
                        }
                    }
                }
            `,
        });
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>
                <GraphqlClientProvider client={providerClient}>{children}</GraphqlClientProvider>
            </QueryClientProvider>
        );

        const { result } = renderHook(
            () =>
                useGraphQuery(definition, {
                    variables: { id: 9 },
                }),
            { wrapper }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(result.current.data).toEqual({
            id: 9,
            name: "provider",
        });
    });

    it("优先使用 options.client 而不是 provider 的 client", async () => {
        const queryClient = new QueryClient();
        const providerClient = createClient(() => ({
            user: {
                profile: {
                    id: 1,
                    name: "provider",
                },
            },
        }));
        const optionsClient = createClient(() => ({
            user: {
                profile: {
                    id: 1,
                    name: "options",
                },
            },
        }));
        const definition = defineGraphql<{ user: { profile: { id: number; name: string } } }>()({
            document: gql`
                query {
                    user {
                        profile {
                            id
                            name
                        }
                    }
                }
            `,
        });
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>
                <GraphqlClientProvider client={providerClient}>{children}</GraphqlClientProvider>
            </QueryClientProvider>
        );

        const { result } = renderHook(
            () =>
                useGraphQuery(definition, {
                    client: optionsClient,
                }),
            { wrapper }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(result.current.data).toEqual({
            id: 1,
            name: "options",
        });
    });

    it("当没有可用 client 时 useGraphQuery 抛错", () => {
        const queryClient = new QueryClient();
        const definition = defineGraphql<{ user: { profile: { id: number } } }>()({
            parseKey: "user.profile",
            document: gql`
                query {
                    user {
                        profile {
                            id
                        }
                    }
                }
            `,
        });
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );

        expect(() => renderHook(() => useGraphQuery(definition), { wrapper })).toThrow("GraphQL client is required");
    });

    it("使用 GraphqlQueryProvider 同时注入 QueryClient 和 GraphQLClient", async () => {
        const queryClient = new QueryClient();
        const client = createClient((_document, variables) => ({
            catalog: {
                product: {
                    id: (variables as { id: number }).id,
                    title: "combined-provider",
                },
            },
        }));
        const definition = defineGraphql<{ catalog: { product: { id: number; title: string } } }>()({
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
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlQueryProvider client={client} queryClient={queryClient}>
                {children}
            </GraphqlQueryProvider>
        );

        const { result } = renderHook(() => useGraphQuery(definition, { variables: { id: 12 } }), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(result.current.data).toEqual({
            id: 12,
            title: "combined-provider",
        });
    });
});
