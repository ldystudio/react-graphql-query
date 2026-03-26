import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import type React from "react";
import { defineGraphql } from "./definition";
import { useGraphQuery } from "./hooks";
import { getGraphQueryKey } from "./key";
import { GraphqlClientProvider } from "./provider";
import { GRAPH_DEBUG_PARSE_KEY_HEADER, graphQuery, graphQueryOptions } from "./query";

function createClient<TData>(
    resolver: (document: unknown, variables: unknown, requestHeaders?: unknown) => TData | Promise<TData>
) {
    return {
        request: async (document: unknown, variables: unknown, requestHeaders?: unknown) =>
            resolver(document, variables, requestHeaders),
    } as GraphQLClient;
}

describe("graph queries", () => {
    it("uses graphQuery to fetch parsed data", async () => {
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

    it("gives priority to definition.client over options.client", async () => {
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

    it("merges definition query defaults into graphQueryOptions", () => {
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

    it("keeps variable names in query keys to avoid collisions", () => {
        expect(getGraphQueryKey("catalog.product", { id: 1, mode: "full" })).not.toEqual(
            getGraphQueryKey("catalog.product", { page: 1, status: "full" })
        );
        expect(getGraphQueryKey("catalog.product", { id: 1, mode: "full" })).toEqual(
            getGraphQueryKey("catalog.product", { mode: "full", id: 1 })
        );
    });

    it("passes requestHeaders through without leaking parseKey", async () => {
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

    it("adds x-graph-parse-key when provider debugParseKeyHeader is enabled", async () => {
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

    it("throws when graphQuery is missing every client source", async () => {
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

    it("uses useGraphQuery inside QueryClientProvider", async () => {
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

    it("uses provider client when options.client is omitted", async () => {
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

    it("gives priority to options.client over provider client", async () => {
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

    it("throws in useGraphQuery when no client is available", () => {
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
});
