import { describe, expect, it } from "bun:test";
import type { MutationFunctionContext } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { GraphQLClient, RequestOptions } from "graphql-request";
import { gql } from "graphql-request";
import type React from "react";
import { getGraphData, setGraphData } from "../cache";
import { defineGraphql } from "../definition";
import { useGraphMutation, useGraphQuery } from "../hooks";
import { createInitialDataByParseKey, getGraphQueryKey } from "../key";
import { graphMutation, graphMutationOptionsWithRuntime } from "../mutation";
import { GraphqlQueryProvider } from "../provider";

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

describe("GraphQL 变更", () => {
    it("使用 graphMutation 获取解析后的数据", async () => {
        const client = createClient((_document, variables) => ({
            catalog: {
                updateProduct: {
                    id: (variables as { id: number }).id,
                    title: "updated",
                },
            },
        }));
        const definition = defineGraphql<{
            catalog: {
                updateProduct: {
                    id: number;
                    title: string;
                };
            };
        }>()({
            parseKey: "catalog.updateProduct",
            document: gql`
                mutation ($id: Int!) {
                    catalog {
                        updateProduct(id: $id) {
                            id
                            title
                        }
                    }
                }
            `,
        });

        const data = await graphMutation(definition, {
            client,
            variables: { id: 5 },
        });

        expect(data).toEqual({
            id: 5,
            title: "updated",
        });
    });

    it("为 mutation options 提供默认 mutationKey，并允许调用变量覆盖 definition 默认变量", async () => {
        const receivedVariables: Array<unknown> = [];
        const client = createClient((_document, variables) => {
            receivedVariables.push(variables);

            return {
                catalog: {
                    updateProduct: {
                        id: (variables as { id: number; title: string }).id,
                        title: (variables as { id: number; title: string }).title,
                    },
                },
            };
        });
        const definition = defineGraphql<
            {
                catalog: {
                    updateProduct: {
                        id: number;
                        title: string;
                    };
                };
            },
            {
                id: number;
                title: string;
            }
        >()({
            client,
            parseKey: "catalog.updateProduct",
            variables: {
                id: 1,
                title: "default",
            },
            document: gql`
                mutation ($id: Int!, $title: String!) {
                    catalog {
                        updateProduct(id: $id, title: $title) {
                            id
                            title
                        }
                    }
                }
            `,
        });
        const queryClient = new QueryClient();
        const options = graphMutationOptionsWithRuntime(definition, undefined, { queryClient });
        const mutationContext: MutationFunctionContext = {
            client: queryClient,
            meta: undefined,
            mutationKey: options.mutationKey,
        };

        const result = await options.mutationFn?.(
            {
                id: 2,
                title: "override",
            },
            mutationContext
        );

        expect(options.mutationKey).toEqual(getGraphQueryKey(definition));
        expect(result).toEqual({
            id: 2,
            title: "override",
        });
        expect(receivedVariables).toEqual([
            {
                id: 2,
                title: "override",
            },
        ]);
    });

    it("将回调包装为带 graphContext 的 mutation options", async () => {
        const client = createClient((_document, variables) => ({
            catalog: {
                updateProduct: {
                    id: (variables as { id: number }).id,
                    title: "selected",
                },
            },
        }));
        const definition = defineGraphql<{
            catalog: {
                updateProduct: {
                    id: number;
                    title: string;
                };
            };
        }>()({
            client,
            parseKey: "catalog.updateProduct",
            document: gql`
                mutation ($id: Int!) {
                    catalog {
                        updateProduct(id: $id) {
                            id
                            title
                        }
                    }
                }
            `,
        });
        const queryClient = new QueryClient();
        const onMutateCalls: Array<unknown> = [];
        const onSuccessCalls: Array<unknown> = [];
        const onErrorCalls: Array<unknown> = [];
        const onSettledCalls: Array<unknown> = [];
        const options = graphMutationOptionsWithRuntime(
            definition,
            {
                select: (data) => data.title,
                onMutate: async (variables, context) => {
                    onMutateCalls.push({ variables, context });

                    return { rollbackToken: "rb" };
                },
                onSuccess: (data, variables, onMutateResult, context) => {
                    onSuccessCalls.push({ data, variables, onMutateResult, context });
                },
                onError: (error, variables, onMutateResult, context) => {
                    onErrorCalls.push({ error, variables, onMutateResult, context });
                },
                onSettled: (data, error, variables, onMutateResult, context) => {
                    onSettledCalls.push({ data, error, variables, onMutateResult, context });
                },
            },
            { queryClient }
        );
        const mutationContext: MutationFunctionContext = {
            client: queryClient,
            meta: undefined,
            mutationKey: options.mutationKey,
        };

        const data = await options.mutationFn?.({ id: 3 }, mutationContext);
        const onMutateResult = await options.onMutate?.({ id: 3 }, mutationContext);
        options.onSuccess?.(data as string, { id: 3 }, onMutateResult as { rollbackToken: string }, mutationContext);
        const error = new Error("failed");
        options.onError?.(error, { id: 3 }, onMutateResult as { rollbackToken: string }, mutationContext);
        options.onSettled?.(
            data as string,
            null,
            { id: 3 },
            onMutateResult as { rollbackToken: string },
            mutationContext
        );

        expect(data).toBe("selected");
        expect(onMutateCalls).toHaveLength(1);
        expect(onSuccessCalls).toHaveLength(1);
        expect(onErrorCalls).toHaveLength(1);
        expect(onSettledCalls).toHaveLength(1);
        expect(onMutateCalls[0]).toMatchObject({
            variables: { id: 3 },
            context: {
                client,
                definition,
                queryClient,
            },
        });
        expect(onSuccessCalls[0]).toMatchObject({
            data: "selected",
            variables: { id: 3 },
            onMutateResult: { rollbackToken: "rb" },
            context: {
                client,
                definition,
                queryClient,
            },
        });
        expect(onErrorCalls[0]).toMatchObject({
            error,
            variables: { id: 3 },
            onMutateResult: { rollbackToken: "rb" },
            context: {
                client,
                definition,
                queryClient,
            },
        });
        expect(onSettledCalls[0]).toMatchObject({
            data: "selected",
            error: null,
            variables: { id: 3 },
            onMutateResult: { rollbackToken: "rb" },
            context: {
                client,
                definition,
                queryClient,
            },
        });
    });

    it("支持通过 provider 的 queryClient 进行乐观更新和回滚", async () => {
        const queryClient = new QueryClient();
        const productList = defineGraphql<{
            catalog: {
                products: {
                    nodes: Array<{ id: number; title: string }>;
                };
            };
        }>()({
            key: ["catalog", "product-list"],
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
        const updateProduct = defineGraphql<
            {
                catalog: {
                    updateProduct: {
                        id: number;
                        title: string;
                    };
                };
            },
            {
                id: number;
                title: string;
            }
        >()({
            parseKey: "catalog.updateProduct",
            document: gql`
                mutation ($id: Int!, $title: String!) {
                    catalog {
                        updateProduct(id: $id, title: $title) {
                            id
                            title
                        }
                    }
                }
            `,
        });
        const client = createClient(
            () =>
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error("mutation failed")), 100);
                })
        );
        const queryKey = getGraphQueryKey(productList);

        queryClient.setQueryData(
            queryKey,
            createInitialDataByParseKey(productList, [
                {
                    id: 1,
                    title: "old",
                },
            ])
        );

        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlQueryProvider client={client} queryClient={queryClient}>
                {children}
            </GraphqlQueryProvider>
        );

        const query = renderHook(() => useGraphQuery(productList), { wrapper });
        const mutation = renderHook(
            () =>
                useGraphMutation(updateProduct, {
                    onMutate: async (variables, context) => {
                        const previous = getGraphData(context.queryClient, productList);

                        setGraphData(context.queryClient, productList, undefined, [
                            {
                                id: variables.id,
                                title: variables.title,
                            },
                        ]);

                        return { previous };
                    },
                    onError: (_error, _variables, rollback, context) => {
                        if (rollback?.previous) {
                            setGraphData(context.queryClient, productList, undefined, rollback.previous);
                        }
                    },
                }),
            { wrapper }
        );

        await waitFor(() => expect(query.result.current.data).toEqual([{ id: 1, title: "old" }]));

        act(() => {
            mutation.result.current.mutate({
                id: 1,
                title: "new",
            });
        });

        await waitFor(() => expect(query.result.current.data).toEqual([{ id: 1, title: "new" }]));
        await waitFor(() => expect(mutation.result.current.isError).toBe(true));
        await waitFor(() => expect(query.result.current.data).toEqual([{ id: 1, title: "old" }]));
    });
});
