import { describe, expect, it } from "bun:test";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { gql } from "graphql-request";
import { defineGraphql } from "../definition";

describe("defineGraphql 定义", () => {
    it("省略 parseKey 时自动推导", () => {
        const definition = defineGraphql<{ session: { revoke: { ok: boolean } } }>()({
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

        expect(definition.kind).toBe("Mutation");
        expect(definition.parseKey).toBe("session.revoke");
    });

    it("保留手动指定的 parseKey", () => {
        const definition = defineGraphql<{ catalog: { products: { nodes: string[] } } }>()({
            parseKey: "catalog.products.nodes",
            document: gql`
                query {
                    catalog {
                        products {
                            nextCursor
                            nodes
                        }
                    }
                }
            `,
        });

        expect(definition.kind).toBe("Query");
        expect(definition.parseKey).toBe("catalog.products.nodes");
    });

    it("支持不经过泛型工厂调用直接使用 typed document", () => {
        const document = gql`
            query ($id: Int!) {
                catalog {
                    product(id: $id) {
                        id
                    }
                }
            }
        ` as unknown as TypedDocumentNode<
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
        >;
        const definition = defineGraphql({
            document,
            key: ["catalog", "product-detail"],
        });

        expect(definition.kind).toBe("Query");
        expect(definition.parseKey).toBe("catalog.product");
        expect(definition.key).toEqual(["catalog", "product-detail"]);
    });

    it("从 typed document 推导 parseKey 时忽略 __typename", () => {
        const document = gql`
            query {
                system {
                    release {
                        minVersion
                    }
                }
            }
        ` as unknown as TypedDocumentNode<
            {
                __typename?: "Query";
                system?: {
                    __typename?: "SystemQuery";
                    release?: {
                        __typename?: "ReleaseInfo";
                        minVersion?: string | null;
                    } | null;
                } | null;
            },
            Record<string, never>
        >;
        const definition = defineGraphql({
            document,
        });

        expect(definition.kind).toBe("Query");
        expect(definition.parseKey).toBe("system.release");
    });

    it("泛型工厂在标量数组叶子场景保持与运行时一致", () => {
        const definition = defineGraphql<{ viewer: { tags: string[] } }>()({
            document: gql`
                query {
                    viewer {
                        tags
                    }
                }
            `,
        });

        expect(definition.kind).toBe("Query");
        expect(definition.parseKey).toBe("viewer");
    });
});
