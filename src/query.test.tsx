import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import type React from "react";
import { defineGraphql } from "./definition";
import { useGraphQuery } from "./hooks";
import { GraphqlClientProvider } from "./provider";
import { graphQuery, graphQueryOptions } from "./query";

function createClient<TData>(resolver: (document: unknown, variables: unknown) => TData | Promise<TData>) {
    return {
        request: async (document: unknown, variables: unknown) => resolver(document, variables),
    } as GraphQLClient;
}

describe("graph queries", () => {
    it("uses graphQuery to fetch parsed data", async () => {
        const queryClient = new QueryClient();
        const client = createClient(() => ({
            course: {
                steamCourse: {
                    list: [{ id: 1 }, { id: 2 }],
                },
            },
        }));
        const definition = defineGraphql<{ course: { steamCourse: { list: Array<{ id: number }> } } }>()({
            parseKey: "course.steamCourse.list",
            document: gql`
                query {
                    course {
                        steamCourse {
                            list {
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
            account: {
                login: {
                    token: "definition",
                },
            },
        }));
        const optionsClient = createClient(() => ({
            account: {
                login: {
                    token: "options",
                },
            },
        }));
        const definition = defineGraphql<{ account: { login: { token: string } } }>()({
            client: definitionClient,
            document: gql`
                mutation {
                    account {
                        login {
                            token
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
            token: "definition",
        });
    });

    it("merges definition query defaults into graphQueryOptions", () => {
        const client = createClient(() => ({
            account: {
                logout: {
                    ok: true,
                },
            },
        }));
        const definition = defineGraphql<{ account: { logout: { ok: boolean } } }>()({
            client,
            staleTime: 5000,
            document: gql`
                mutation {
                    account {
                        logout {
                            ok
                        }
                    }
                }
            `,
        });

        const options = graphQueryOptions(definition);

        expect(options.staleTime).toBe(5000);
    });

    it("uses useGraphQuery inside QueryClientProvider", async () => {
        const queryClient = new QueryClient();
        const client = createClient((_document, variables) => ({
            ugc: {
                detail: {
                    id: (variables as { id: number }).id,
                    title: "hello",
                },
            },
        }));
        const definition = defineGraphql<{ ugc: { detail: { id: number; title: string } } }>()({
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
});
