import { describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { gql } from "graphql-request";
import {
    cancelGraphQuery,
    getGraphData,
    invalidateGraphQuery,
    queryKeyOf,
    removeGraphQuery,
    resetGraphQuery,
    setGraphData,
} from "../cache";
import { defineGraphql } from "../definition";

describe("GraphQL 缓存辅助方法", () => {
    it("缓存为空时 getGraphData 返回 undefined", () => {
        const queryClient = new QueryClient();
        const definition = defineGraphql<{
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

        expect(getGraphData(queryClient, definition)).toBeUndefined();
    });

    it("从根缓存中读取解析后的数据", () => {
        const queryClient = new QueryClient();
        const definition = defineGraphql<{
            catalog: {
                products: {
                    nodes: Array<{ id: number; title: string }>;
                    total: number;
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
                            total
                        }
                    }
                }
            `,
        });

        queryClient.setQueryData(queryKeyOf(definition), {
            catalog: {
                products: {
                    nodes: [{ id: 1, title: "a" }],
                    total: 1,
                },
            },
        });

        expect(getGraphData(queryClient, definition)).toEqual([{ id: 1, title: "a" }]);
    });

    it("更新解析后的数据时保留根缓存中的同级字段", () => {
        const queryClient = new QueryClient();
        const definition = defineGraphql<{
            catalog: {
                products: {
                    nodes: Array<{ id: number; title: string }>;
                    total: number;
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
                            total
                        }
                    }
                }
            `,
        });
        const queryKey = queryKeyOf(definition);

        queryClient.setQueryData(queryKey, {
            catalog: {
                products: {
                    nodes: [{ id: 1, title: "old" }],
                    total: 99,
                },
            },
        });

        setGraphData(queryClient, definition, undefined, (current) =>
            current?.map((item) => ({
                ...item,
                title: "new",
            }))
        );

        expect(getGraphData(queryClient, definition)).toEqual([{ id: 1, title: "new" }]);
        expect(
            queryClient.getQueryData<{
                catalog: {
                    products: {
                        nodes: Array<{ id: number; title: string }>;
                        total: number;
                    };
                };
            }>(queryKey)
        ).toEqual({
            catalog: {
                products: {
                    nodes: [{ id: 1, title: "new" }],
                    total: 99,
                },
            },
        });
    });

    it("在空缓存上设置解析数据时自动创建根结构", () => {
        const queryClient = new QueryClient();
        const definition = defineGraphql<{
            user: {
                profile: {
                    id: number;
                    name: string;
                };
            };
        }>()({
            parseKey: "user.profile",
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

        setGraphData(queryClient, definition, undefined, {
            id: 1,
            name: "Ada",
        });

        expect(
            queryClient.getQueryData<{
                user: {
                    profile: {
                        id: number;
                        name: string;
                    };
                };
            }>(queryKeyOf(definition))
        ).toEqual({
            user: {
                profile: {
                    id: 1,
                    name: "Ada",
                },
            },
        });
    });

    it("当 updater 返回 undefined 时保留已有缓存，并且不会创建新缓存", () => {
        const queryClient = new QueryClient();
        const definition = defineGraphql<{
            user: {
                profile: {
                    id: number;
                };
            };
        }>()({
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
        const queryKey = queryKeyOf(definition);
        const emptyQueryKey = queryKeyOf(definition, { id: 2 } as never);

        queryClient.setQueryData(queryKey, {
            user: {
                profile: {
                    id: 1,
                },
            },
        });

        setGraphData(queryClient, definition, undefined, () => undefined);
        setGraphData(queryClient, definition, { id: 2 } as never, () => undefined);

        expect(
            queryClient.getQueryData<{
                user: {
                    profile: {
                        id: number;
                    };
                };
            }>(queryKey)
        ).toEqual({
            user: {
                profile: {
                    id: 1,
                },
            },
        });
        expect(getGraphData(queryClient, definition)).toEqual({ id: 1 });
        expect(queryClient.getQueryData(emptyQueryKey)).toBeUndefined();
    });

    it("按 variables 隔离不同 query key 的缓存数据", () => {
        const queryClient = new QueryClient();
        const definition = defineGraphql<
            {
                catalog: {
                    product: {
                        id: number;
                        title: string;
                    };
                };
            },
            {
                id: number;
            }
        >()({
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

        setGraphData(queryClient, definition, { id: 1 }, { id: 1, title: "one" });
        setGraphData(queryClient, definition, { id: 2 }, { id: 2, title: "two" });

        expect(getGraphData(queryClient, definition, { id: 1 })).toEqual({ id: 1, title: "one" });
        expect(getGraphData(queryClient, definition, { id: 2 })).toEqual({ id: 2, title: "two" });
        expect(queryKeyOf(definition, { id: 1 })).not.toEqual(queryKeyOf(definition, { id: 2 }));
    });

    it("封装常用的 queryClient 操作", async () => {
        const queryClient = new QueryClient();
        const definition = defineGraphql<{ user: { profile: { id: number } } }>()({
            key: ["user", "profile"],
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
        const queryKey = queryKeyOf(definition);

        queryClient.setQueryData(queryKey, {
            user: {
                profile: {
                    id: 1,
                },
            },
        });

        await cancelGraphQuery(queryClient, definition);
        await invalidateGraphQuery(queryClient, definition);
        await resetGraphQuery(queryClient, definition);
        removeGraphQuery(queryClient, definition);

        expect(queryClient.getQueryData(queryKey)).toBeUndefined();
    });
});

describe("无限查询缓存", () => {
    const definition = defineGraphql<
        { catalog: { products: { nodes: Array<{ id: number; title: string }>; nextPage: number | null } } },
        { category: string }
    >()({
        parseKey: "catalog.products",
        document: gql`
            query Products($category: String!) {
                catalog {
                    products(category: $category) {
                        nodes { id title }
                        nextPage
                    }
                }
            }
        `,
    });
    const infinite = { kind: "infinite" } as const;

    it("按 variables 更新分页缓存并保留游标", () => {
        const queryClient = new QueryClient();
        const variables = { category: "a" };
        const otherVariables = { category: "b" };
        const original = {
            pages: [
                { nodes: [{ id: 1, title: "one" }], nextPage: 20 },
                { nodes: [{ id: 2, title: "two" }], nextPage: null },
            ],
            pageParams: [null, 20],
        };
        queryClient.setQueryData(queryKeyOf(definition, variables), original);
        queryClient.setQueryData(queryKeyOf(definition, otherVariables), original);

        const result = setGraphData(
            queryClient,
            definition,
            variables,
            (current) =>
                current && {
                    ...current,
                    pages: current.pages.map((page) => ({
                        ...page,
                        nodes: page.nodes.filter((item) => item.id !== 2),
                    })),
                },
            infinite
        );

        const expected = { ...original, pages: [original.pages[0], { nodes: [], nextPage: null }] };
        expect(result).toEqual(expected);
        expect(getGraphData(queryClient, definition, variables, infinite)).toEqual(expected);
        expect(queryClient.getQueryData(queryKeyOf(definition, variables))).toEqual(expected);
        expect(getGraphData(queryClient, definition, otherVariables, infinite)).toEqual(original);
        expect(original.pages[1].nodes).toHaveLength(1);
    });

    it("支持创建分页缓存并读取指定类型的页参数", () => {
        const queryClient = new QueryClient();
        const variables = { category: "a" };
        const value = { pages: [{ nodes: [{ id: 1, title: "one" }], nextPage: null }], pageParams: [null] };

        setGraphData(queryClient, definition, variables, value, infinite);
        const data = getGraphData<typeof definition, number | null>(queryClient, definition, variables, infinite);
        const pageParam: number | null | undefined = data?.pageParams[0];

        expect(data).toEqual(value);
        expect(queryClient.getQueryData(queryKeyOf(definition, variables))).toEqual(value);
        expect(pageParam).toBeNull();
    });

    it("updater 返回 undefined 时不修改已有分页缓存，也不创建空缓存", () => {
        const queryClient = new QueryClient();
        const variables = { category: "a" };
        const value = { pages: [{ nodes: [], nextPage: null }], pageParams: [null] };
        queryClient.setQueryData(queryKeyOf(definition, variables), value);

        setGraphData(queryClient, definition, variables, () => undefined, infinite);
        setGraphData(queryClient, definition, { category: "b" }, () => undefined, infinite);

        expect(getGraphData(queryClient, definition, variables, infinite)).toEqual(value);
        expect(getGraphData(queryClient, definition, { category: "b" }, infinite)).toBeUndefined();
        expect(queryClient.getQueryState(queryKeyOf(definition, { category: "b" }))).toBeUndefined();
    });
});
