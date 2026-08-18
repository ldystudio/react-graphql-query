import { describe, expect, it } from "bun:test";
import type { InfiniteData } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { GraphQLClient, RequestOptions } from "graphql-request";
import { gql } from "graphql-request";
import type React from "react";
import { defineGraphql } from "../definition";
import { useGraphMutation, useGraphQuery, useInfiniteGraphQuery } from "../hooks";
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

/** 手动控制 resolve/reject 的 deferred，用于精确编排 mutation 完成时机 */
function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}

const productList = defineGraphql<{
    catalog: {
        products: Array<{ id: number; title: string }>;
    };
}>()({
    key: ["catalog", "product-list"],
    parseKey: "catalog.products",
    document: gql`
        query {
            catalog {
                products {
                    id
                    title
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
    { id: number; title: string }
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

describe("乐观更新", () => {
    it("对普通 query 立即应用乐观更新，并在 mutation 失败时自动回滚", async () => {
        const deferred = createDeferred<{ id: number; title: string }>();
        const client = createClient(() => ({
            catalog: {
                products: [{ id: 1, title: "old" }],
            },
        }));
        const mutationClient = createClient(() => deferred.promise);
        const queryClient = new QueryClient();
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlQueryProvider client={client} queryClient={queryClient}>
                {children}
            </GraphqlQueryProvider>
        );

        const query = renderHook(() => useGraphQuery(productList), { wrapper });
        const mutation = renderHook(
            () =>
                useGraphMutation<typeof updateProduct, unknown, { id: number; title: string }, typeof productList>(
                    updateProduct,
                    {
                        client: mutationClient,
                        optimisticUpdate: {
                            query: productList,
                            getOptimisticState: ({ currentData, variables }) =>
                                currentData?.map((item) =>
                                    item.id === variables.id ? { ...item, title: variables.title } : item
                                ),
                        },
                    }
                ),
            { wrapper }
        );

        await waitFor(() => expect(query.result.current.data).toEqual([{ id: 1, title: "old" }]));

        act(() => {
            mutation.result.current.mutate({ id: 1, title: "new" });
        });

        // mutation 尚未完成，乐观更新已生效
        await waitFor(() => expect(query.result.current.data).toEqual([{ id: 1, title: "new" }]));
        expect(mutation.result.current.isPending).toBe(true);

        // mutation 失败 → 自动回滚
        await act(async () => {
            deferred.reject(new Error("mutation failed"));
        });
        await waitFor(() => expect(mutation.result.current.isError).toBe(true));
        await waitFor(() => expect(query.result.current.data).toEqual([{ id: 1, title: "old" }]));
    });

    it("对 infinite query 的 pages 结构应用乐观更新并回滚", async () => {
        type Feed = {
            catalog: {
                posts: {
                    nodes: Array<{ id: number; title: string }>;
                    pageInfo: { endCursor: string | null; hasNextPage: boolean };
                };
            };
        };
        type FeedVariables = { after?: string | null; first: number };

        const feed = defineGraphql<Feed, FeedVariables>()({
            key: ["catalog", "posts"],
            parseKey: "catalog.posts",
            document: gql`
                query ($first: Int!, $after: String) {
                    catalog {
                        posts(first: $first, after: $after) {
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
            `,
        });
        const deletePost = defineGraphql<{ catalog: { deletePost: { ok: boolean } } }, { id: number }>()({
            parseKey: "catalog.deletePost",
            document: gql`
                mutation ($id: Int!) {
                    catalog {
                        deletePost(id: $id) {
                            ok
                        }
                    }
                }
            `,
        });
        const client = createClient((_document, variables) => {
            const currentVariables = variables as FeedVariables;

            if (currentVariables.after == null) {
                return {
                    catalog: {
                        posts: {
                            nodes: [
                                { id: 1, title: "page-1-a" },
                                { id: 2, title: "page-1-b" },
                            ],
                            pageInfo: { endCursor: "c1", hasNextPage: true },
                        },
                    },
                };
            }

            return {
                catalog: {
                    posts: {
                        nodes: [{ id: 3, title: "page-2-a" }],
                        pageInfo: { endCursor: null, hasNextPage: false },
                    },
                },
            };
        });
        const queryClient = new QueryClient();
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlQueryProvider client={client} queryClient={queryClient}>
                {children}
            </GraphqlQueryProvider>
        );

        const query = renderHook(
            () =>
                useInfiniteGraphQuery(feed, {
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
        const deferred = createDeferred<{ ok: boolean }>();
        const mutationClient = createClient(() => deferred.promise);
        const mutation = renderHook(
            () =>
                useGraphMutation<
                    typeof deletePost,
                    unknown,
                    { ok: boolean },
                    typeof feed,
                    InfiniteData<Feed["catalog"]["posts"], string | null>
                >(deletePost, {
                    client: mutationClient,
                    optimisticUpdate: {
                        query: feed,
                        queryVariables: { first: 2 },
                        kind: "infinite",
                        getOptimisticState: ({ currentData, variables }) =>
                            currentData
                                ? {
                                      ...currentData,
                                      pages: currentData.pages.map((page) => ({
                                          ...page,
                                          nodes: page.nodes.filter((item) => item.id !== variables.id),
                                      })),
                                  }
                                : currentData,
                    },
                }),
            { wrapper }
        );

        await waitFor(() =>
            expect(query.result.current.data).toEqual([
                { id: 1, title: "page-1-a" },
                { id: 2, title: "page-1-b" },
            ])
        );

        // 加载第二页，缓存有两页
        act(() => {
            void query.result.current.fetchNextPage();
        });
        await waitFor(() =>
            expect(query.result.current.data).toEqual([
                { id: 1, title: "page-1-a" },
                { id: 2, title: "page-1-b" },
                { id: 3, title: "page-2-a" },
            ])
        );

        act(() => {
            mutation.result.current.mutate({ id: 2 });
        });

        // 乐观更新：从所有页中移除 id=2
        await waitFor(() =>
            expect(query.result.current.data).toEqual([
                { id: 1, title: "page-1-a" },
                { id: 3, title: "page-2-a" },
            ])
        );

        // mutation 失败 → 自动回滚（两页都恢复）
        await act(async () => {
            deferred.reject(new Error("delete failed"));
        });
        await waitFor(() => expect(mutation.result.current.isError).toBe(true));
        await waitFor(() =>
            expect(query.result.current.data).toEqual([
                { id: 1, title: "page-1-a" },
                { id: 2, title: "page-1-b" },
                { id: 3, title: "page-2-a" },
            ])
        );
    });

    it("乐观更新模式下透传用户 onMutate/onSuccess/onError 并携带 graphContext", async () => {
        const deferred = createDeferred<{ catalog: { updateProduct: { id: number; title: string } } }>();
        const client = createClient(() => ({
            catalog: {
                products: [{ id: 1, title: "old" }],
            },
        }));
        const mutationClient = createClient(() => deferred.promise);
        const queryClient = new QueryClient();
        const calls: Array<{ kind: string; hasQueryClient: boolean }> = [];
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlQueryProvider client={client} queryClient={queryClient}>
                {children}
            </GraphqlQueryProvider>
        );

        const query = renderHook(() => useGraphQuery(productList), { wrapper });
        const mutation = renderHook(
            () =>
                useGraphMutation<typeof updateProduct, unknown, { id: number; title: string }, typeof productList>(
                    updateProduct,
                    {
                        client: mutationClient,
                        optimisticUpdate: {
                            query: productList,
                            getOptimisticState: ({ currentData, variables }) =>
                                currentData?.map((item) =>
                                    item.id === variables.id ? { ...item, title: variables.title } : item
                                ),
                        },
                        onMutate: async (_variables, context) => {
                            calls.push({ kind: "onMutate", hasQueryClient: !!context.queryClient });
                        },
                        onSuccess: (data, _variables, _result, context) => {
                            calls.push({ kind: "onSuccess", hasQueryClient: !!context.queryClient });
                            void data;
                        },
                        onError: (error, _variables, _result, context) => {
                            calls.push({ kind: "onError", hasQueryClient: !!context.queryClient });
                            void error;
                        },
                    }
                ),
            { wrapper }
        );

        await waitFor(() => expect(query.result.current.data).toEqual([{ id: 1, title: "old" }]));

        act(() => {
            mutation.result.current.mutate({ id: 1, title: "new" });
        });
        await waitFor(() => expect(calls.some((call) => call.kind === "onMutate")).toBe(true));

        await act(async () => {
            deferred.resolve({ catalog: { updateProduct: { id: 1, title: "new" } } });
        });

        await waitFor(() => expect(mutation.result.current.isSuccess).toBe(true));
        expect(calls.some((call) => call.kind === "onSuccess" && call.hasQueryClient)).toBe(true);
        expect(calls.some((call) => call.kind === "onMutate" && call.hasQueryClient)).toBe(true);
        expect(query.result.current.data).toEqual([{ id: 1, title: "new" }]);
    });

    it("getOptimisticState 返回 undefined 时保持缓存不变", async () => {
        const deferred = createDeferred<{ catalog: { updateProduct: { id: number; title: string } } }>();
        const client = createClient(() => ({
            catalog: {
                products: [{ id: 1, title: "old" }],
            },
        }));
        const mutationClient = createClient(() => deferred.promise);
        const queryClient = new QueryClient();
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlQueryProvider client={client} queryClient={queryClient}>
                {children}
            </GraphqlQueryProvider>
        );

        const query = renderHook(() => useGraphQuery(productList), { wrapper });
        const mutation = renderHook(
            () =>
                useGraphMutation<typeof updateProduct, unknown, { id: number; title: string }, typeof productList>(
                    updateProduct,
                    {
                        client: mutationClient,
                        optimisticUpdate: {
                            query: productList,
                            getOptimisticState: () => undefined,
                        },
                    }
                ),
            { wrapper }
        );

        await waitFor(() => expect(query.result.current.data).toEqual([{ id: 1, title: "old" }]));

        act(() => {
            mutation.result.current.mutate({ id: 1, title: "new" });
        });

        // mutation 进行中，但 getOptimisticState 返回 undefined → 缓存不变
        await waitFor(() => expect(mutation.result.current.isPending).toBe(true));
        expect(query.result.current.data).toEqual([{ id: 1, title: "old" }]);

        await act(async () => {
            deferred.resolve({ catalog: { updateProduct: { id: 1, title: "new" } } });
        });
        await waitFor(() => expect(mutation.result.current.isSuccess).toBe(true));
        expect(query.result.current.data).toEqual([{ id: 1, title: "old" }]);
    });

    it("invalidateQueryOnSuccess 为 true 时成功后失效 query 触发重新拉取", async () => {
        let fetchCount = 0;
        const deferred = createDeferred<{ catalog: { updateProduct: { id: number } } }>();
        const client = createClient(() => {
            fetchCount += 1;

            return {
                catalog: {
                    products: [{ id: 1, title: `server-${fetchCount}` }],
                },
            };
        });
        const mutationClient = createClient(() => deferred.promise);
        const queryClient = new QueryClient();
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlQueryProvider client={client} queryClient={queryClient}>
                {children}
            </GraphqlQueryProvider>
        );

        const query = renderHook(() => useGraphQuery(productList), { wrapper });
        const mutation = renderHook(
            () =>
                useGraphMutation<typeof updateProduct, unknown, { id: number; title: string }, typeof productList>(
                    updateProduct,
                    {
                        client: mutationClient,
                        optimisticUpdate: {
                            query: productList,
                            invalidateQueryOnSuccess: true,
                            getOptimisticState: ({ currentData }) => currentData,
                        },
                    }
                ),
            { wrapper }
        );

        await waitFor(() => expect(query.result.current.data).toEqual([{ id: 1, title: "server-1" }]));

        act(() => {
            mutation.result.current.mutate({ id: 1, title: "new" });
        });
        await act(async () => {
            deferred.resolve({ catalog: { updateProduct: { id: 1 } } });
        });

        await waitFor(() => expect(mutation.result.current.isSuccess).toBe(true));
        // invalidate 触发重新拉取，fetchCount 变为 2
        await waitFor(() => expect(query.result.current.data).toEqual([{ id: 1, title: "server-2" }]));
    });
});
