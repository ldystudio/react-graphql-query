import { describe, expect, it } from "bun:test";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { gql } from "graphql-request";
import { defineGraphql } from "../definition";
import type { GraphDocumentData, GraphDocumentItem, GraphQueryData, GraphQueryItem } from "../index";

type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
            ? true
            : false
        : false;
type Assert<T extends true> = T;

type ProductNode = {
    id: number;
    title: string;
};

const productListDocument = gql`
    query ProductList {
        catalog {
            products {
                nodes {
                    id
                    title
                }
            }
        }
    }
` as unknown as TypedDocumentNode<
    {
        catalog: {
            products: {
                nodes: ProductNode[];
            };
        };
    },
    Record<string, never>
>;

const productListDefinition = defineGraphql({
    parseKey: "catalog.products.nodes",
    document: productListDocument,
});

const viewerTagsDocument = gql`
    query ViewerTags {
        viewer {
            tags
        }
    }
` as unknown as TypedDocumentNode<
    {
        viewer: {
            tags: string[];
        };
    },
    Record<string, never>
>;

const viewerTagsDefinition = defineGraphql<{ viewer: { tags: string[] } }>()({
    document: viewerTagsDocument,
});

type DashboardRoot = {
    notifications: Array<{
        id: number;
        message: string;
    }>;
    accountSummary: {
        unreadCount: number;
        creditBalance: number;
    };
};

const dashboardDocument = gql`
    query Dashboard {
        notifications {
            id
            message
        }
        accountSummary {
            unreadCount
            creditBalance
        }
    }
` as unknown as TypedDocumentNode<DashboardRoot, Record<string, never>>;

const dashboardDefinition = defineGraphql({
    parseKey: "",
    key: ["dashboard"],
    document: dashboardDocument,
});

const typeAssertions = {
    graphQueryData: true as Assert<Equal<GraphQueryData<typeof productListDefinition>, ProductNode[]>>,
    graphQueryItem: true as Assert<Equal<GraphQueryItem<typeof productListDefinition>, ProductNode>>,
    graphDocumentData: true as Assert<
        Equal<GraphDocumentData<typeof productListDocument, "catalog.products.nodes">, ProductNode[]>
    >,
    graphDocumentItem: true as Assert<
        Equal<GraphDocumentItem<typeof productListDocument, "catalog.products.nodes">, ProductNode>
    >,
    inferredScalarArrayParseKey: true as Assert<Equal<typeof viewerTagsDefinition.parseKey, "viewer">>,
    inferredScalarArrayData: true as Assert<Equal<GraphQueryData<typeof viewerTagsDefinition>, { tags: string[] }>>,
    rootParseKeyData: true as Assert<Equal<GraphQueryData<typeof dashboardDefinition>, DashboardRoot>>,
    rootDocumentData: true as Assert<Equal<GraphDocumentData<typeof dashboardDocument, "">, DashboardRoot>>,
};

describe("类型工具", () => {
    it("暴露可用于 parseKey 解析后的数据与数组元素类型", () => {
        expect(productListDefinition.parseKey).toBe("catalog.products.nodes");
        expect(viewerTagsDefinition.parseKey).toBe("viewer");
        expect(dashboardDefinition.parseKey).toBe("");
        expect(typeAssertions).toBeDefined();
    });
});
