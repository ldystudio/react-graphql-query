import { describe, expect, it } from "bun:test";
import type { GraphQLClient, RequestOptions } from "graphql-request";
import { gql } from "graphql-request";
import { defineGraphql } from "../definition";
import {
    GRAPH_DEBUG_PARSE_KEY_HEADER,
    getGraphClient,
    requestGraphRootData,
    resolveGraphVariables,
    selectGraphData,
    withDebugParseKeyHeader,
} from "../runtime";

function createClient<TData>(resolver: (options: RequestOptions) => TData | Promise<TData>) {
    return {
        request: async (options: RequestOptions) => resolver(options),
    } as GraphQLClient;
}

describe("运行时辅助方法", () => {
    it("优先使用 definition.client，并在缺失 client 时抛错", () => {
        const definitionClient = createClient(() => ({
            user: {
                profile: {
                    id: 1,
                },
            },
        }));
        const optionsClient = createClient(() => ({
            user: {
                profile: {
                    id: 2,
                },
            },
        }));
        const definition = defineGraphql<{ user: { profile: { id: number } } }>()({
            client: definitionClient,
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

        expect(getGraphClient(definition, { client: optionsClient })).toBe(definitionClient);
        expect(() =>
            getGraphClient(
                defineGraphql<{ user: { profile: { id: number } } }>()({
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
                }),
                {}
            )
        ).toThrow("GraphQL client is required");
    });

    it("按开关注入 debug parseKey header", () => {
        expect(withDebugParseKeyHeader({ authorization: "Bearer token" }, "user.profile", false)).toEqual({
            authorization: "Bearer token",
        });
        expect(withDebugParseKeyHeader({ authorization: "Bearer token" }, "user.profile", true)).toEqual({
            authorization: "Bearer token",
            [GRAPH_DEBUG_PARSE_KEY_HEADER]: "user.profile",
        });
    });

    it("在未传入 variables 时回退到 definition 默认变量，否则使用调用变量", () => {
        expect(resolveGraphVariables({ id: 1 }, undefined)).toEqual({ id: 1 });
        expect(resolveGraphVariables({ id: 1 }, { id: 2 })).toEqual({ id: 2 });
    });

    it("在 variables 为空时不传 variables 字段，并保留 headers 与 signal", async () => {
        const requests: RequestOptions[] = [];
        const client = createClient((options) => {
            requests.push(options);

            return {
                user: {
                    profile: {
                        id: 1,
                        name: "Ada",
                    },
                },
            };
        });
        const definition = defineGraphql<{ user: { profile: { id: number; name: string } } }>()({
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
        const signal = new AbortController().signal;

        const result = await requestGraphRootData(
            client,
            definition.document,
            undefined,
            { authorization: "Bearer token" },
            signal
        );

        expect(result).toEqual({
            user: {
                profile: {
                    id: 1,
                    name: "Ada",
                },
            },
        });
        expect(requests).toHaveLength(1);
        expect(requests[0]).toEqual({
            document: definition.document,
            requestHeaders: {
                authorization: "Bearer token",
            },
            signal,
        });
        expect("variables" in requests[0]).toBe(false);
    });

    it("在 variables 存在时按原样传递 variables", async () => {
        const requests: RequestOptions[] = [];
        const client = createClient((options) => {
            requests.push(options);

            return {
                user: {
                    profile: {
                        id: 2,
                        name: "Grace",
                    },
                },
            };
        });
        const definition = defineGraphql<
            {
                user: {
                    profile: {
                        id: number;
                        name: string;
                    };
                };
            },
            {
                id: number;
            }
        >()({
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

        await requestGraphRootData(client, definition.document, { id: 2 }, { authorization: "Bearer token" });

        expect(requests).toHaveLength(1);
        expect(requests[0]).toEqual({
            document: definition.document,
            requestHeaders: {
                authorization: "Bearer token",
            },
            signal: undefined,
            variables: {
                id: 2,
            },
        });
    });

    it("按 parseKey 选取数据，并允许通过 select 做二次变换", () => {
        const definition = defineGraphql<{
            catalog: {
                products: {
                    nodes: Array<{ id: number; title: string }>;
                };
            };
        }>()({
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
        const rootData = {
            catalog: {
                products: {
                    nodes: [
                        { id: 1, title: "a" },
                        { id: 2, title: "b" },
                    ],
                },
            },
        };

        const parsedData = selectGraphData(rootData, definition) as Array<{ id: number; title: string }>;
        const selectedData = selectGraphData(rootData, definition, (data) =>
            data.map((item) => item.title)
        ) as string[];

        expect(parsedData).toEqual([
            { id: 1, title: "a" },
            { id: 2, title: "b" },
        ]);
        expect(selectedData).toEqual(["a", "b"]);
    });

    it("空 parseKey 返回完整 root data", () => {
        const definition = defineGraphql<{
            notifications: Array<{ id: number; message: string }>;
            accountSummary: { unreadCount: number; creditBalance: number };
        }>()({
            parseKey: "",
            key: ["dashboard"],
            document: gql`
                query {
                    notifications {
                        id
                        message
                    }
                    accountSummary {
                        unreadCount
                        creditBalance
                    }
                }
            `,
        });
        const rootData = {
            notifications: [{ id: 1, message: "Welcome" }],
            accountSummary: {
                unreadCount: 2,
                creditBalance: 8,
            },
        };

        const parsedData = selectGraphData(rootData, definition);
        const selectedData = selectGraphData(rootData, definition, (data) => data.accountSummary);

        expect(parsedData).toBe(rootData);
        expect(selectedData).toEqual({
            unreadCount: 2,
            creditBalance: 8,
        });
    });
});
