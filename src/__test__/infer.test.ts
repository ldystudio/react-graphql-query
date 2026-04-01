import { describe, expect, it } from "bun:test";
import { gql } from "graphql-request";
import { inferGraphParseKey, inferGraphqlOperationKind } from "../infer";

describe("inferGraphqlOperationKind 推导", () => {
    it("可以识别 query", () => {
        expect(
            inferGraphqlOperationKind(gql`
                query {
                    viewer {
                        id
                    }
                }
            `)
        ).toBe("Query");
    });

    it("可以识别 mutation", () => {
        expect(
            inferGraphqlOperationKind(gql`
                mutation {
                    session {
                        revoke {
                            ok
                        }
                    }
                }
            `)
        ).toBe("Mutation");
    });
});

describe("inferGraphParseKey 推导", () => {
    it("可以推导单一路径的嵌套字段", () => {
        expect(
            inferGraphParseKey(gql`
                query {
                    store {
                        inventory {
                            nodes {
                                id
                            }
                        }
                    }
                }
            `)
        ).toBe("store.inventory.nodes");
    });

    it("在分叉对象处停止推导", () => {
        expect(
            inferGraphParseKey(gql`
                query {
                    catalog {
                        products {
                            nextPage
                            nodes {
                                id
                            }
                        }
                    }
                }
            `)
        ).toBe("catalog.products");
    });

    it("存在别名时使用别名", () => {
        expect(
            inferGraphParseKey(gql`
                query {
                    storefrontAlias: storefront {
                        featuredAlias: featuredProducts {
                            id
                        }
                    }
                }
            `)
        ).toBe("storefrontAlias.featuredAlias");
    });

    it("当 document 含有多个顶层字段时抛错", () => {
        expect(() =>
            inferGraphParseKey(gql`
                query {
                    store {
                        id
                    }
                    viewer {
                        id
                    }
                }
            `)
        ).toThrow("exactly one top-level field");
    });

    it("当 document 不包含操作定义时抛错", () => {
        expect(() =>
            inferGraphParseKey(gql`
                fragment UserProfile on User {
                    id
                }
            `)
        ).toThrow("does not contain an operation definition");
    });
});
