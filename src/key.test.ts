import { describe, expect, it } from "bun:test";
import { hashKey } from "@tanstack/react-query";
import { createInitialDataByParseKey, getGraphLogKey, getGraphQueryKey, getValueByParseKey } from "./key";

describe("key helpers", () => {
    it("creates queryKey from parseKey and variables", () => {
        expect(getGraphQueryKey("catalog.product", { id: 1, mode: "full" })).toEqual([
            "catalog",
            "product",
            { id: 1, mode: "full" },
        ]);
    });

    it("keeps queryKey stable for equal variables and distinct for different variable names", () => {
        expect(hashKey(getGraphQueryKey("catalog.product", { id: 1, mode: "full" }))).toBe(
            hashKey(getGraphQueryKey("catalog.product", { mode: "full", id: 1 }))
        );
        expect(hashKey(getGraphQueryKey("catalog.product", { id: 1, mode: "full" }))).not.toBe(
            hashKey(getGraphQueryKey("catalog.product", { page: 1, status: "full" }))
        );
    });

    it("creates logKey from parseKey", () => {
        expect(getGraphLogKey("catalog.products.nodes")).toBe("catalog-products-nodes");
        expect(getGraphLogKey({ parseKey: "viewer.profile" })).toBe("viewer-profile");
        expect(getGraphLogKey(undefined)).toBe("");
    });

    it("gets deep value by parseKey", () => {
        expect(
            getValueByParseKey(
                {
                    storefront: {
                        featuredProducts: {
                            nodes: [{ id: 1 }],
                        },
                    },
                },
                "storefront.featuredProducts.nodes"
            )
        ).toEqual([{ id: 1 }]);
    });

    it("wraps initial data to root shape", () => {
        expect(createInitialDataByParseKey("catalog.product", { id: 1 })).toEqual({
            catalog: {
                product: {
                    id: 1,
                },
            },
        });
    });
});
