import { describe, expect, it } from "bun:test";
import { hashKey } from "@tanstack/react-query";
import { createInitialDataByParseKey, getGraphLogKey, getGraphQueryKey, getValueByParseKey } from "../key";

describe("键辅助方法", () => {
    it("根据 parseKey 和 variables 创建 queryKey", () => {
        expect(getGraphQueryKey("catalog.product", { id: 1, mode: "full" })).toEqual([
            "catalog",
            "product",
            { id: 1, mode: "full" },
        ]);
    });

    it("生成 query key 时优先使用 definition.key", () => {
        expect(
            getGraphQueryKey(
                {
                    key: ["catalog", "product-list"],
                    parseKey: "catalog.products.nodes",
                },
                { first: 20 }
            )
        ).toEqual(["catalog", "product-list", { first: 20 }]);
    });

    it("相同变量值时保持 queryKey 稳定，不同变量名时保持区分", () => {
        expect(hashKey(getGraphQueryKey("catalog.product", { id: 1, mode: "full" }))).toBe(
            hashKey(getGraphQueryKey("catalog.product", { mode: "full", id: 1 }))
        );
        expect(hashKey(getGraphQueryKey("catalog.product", { id: 1, mode: "full" }))).not.toBe(
            hashKey(getGraphQueryKey("catalog.product", { page: 1, status: "full" }))
        );
    });

    it("根据 parseKey 创建 logKey", () => {
        expect(getGraphLogKey("catalog.products.nodes")).toBe("catalog-products-nodes");
        expect(getGraphLogKey({ parseKey: "viewer.profile" })).toBe("viewer-profile");
        expect(getGraphLogKey(undefined)).toBe("");
    });

    it("根据 parseKey 获取深层值", () => {
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

    it("将初始数据包装为根结构", () => {
        expect(createInitialDataByParseKey("catalog.product", { id: 1 })).toEqual({
            catalog: {
                product: {
                    id: 1,
                },
            },
        });
    });
});
