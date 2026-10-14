import { describe, expect, it } from "bun:test";
import { applyOperationTypeOverridesToSource } from "../codegen/overrides";

describe("operation variables overrides", () => {
    it.each(["Query", "Mutation", "Subscription"])("替换 %sVariables 的字段并保留 Exact 和可选性", (kind) => {
        const operation = `Demo${kind}Variables`;
        const source = `export type ${operation} = Exact<{
            id: string;
            imageAuditReason?: InputMaybe<unknown>;
        }>;`;
        const result = applyOperationTypeOverridesToSource(source, "generated.ts", [
            { operation, path: "imageAuditReason", type: "InputMaybe<Record<string, AuditReason>>" },
            { operation, path: "id", type: "number" },
        ]);

        expect(result.replace(/\s+/g, " ").trim()).toBe(
            `export type ${operation} = Exact<{ id: number; imageAuditReason?: InputMaybe<Record<string, AuditReason>>; }>;`
        );
    });

    it("允许覆盖没有 Exact 包装的 Variables", () => {
        const result = applyOperationTypeOverridesToSource(
            "export type DemoQueryVariables = { id?: string | null; other: boolean };",
            "generated.ts",
            [{ operation: "DemoQueryVariables", path: "id", type: "number | null" }]
        );

        expect(result.replace(/\s+/g, " ").trim()).toBe(
            "export type DemoQueryVariables = { id?: number | null; other: boolean; };"
        );
    });

    it("Exact 内的错误路径仍然抛错", () => {
        expect(() =>
            applyOperationTypeOverridesToSource(
                "export type DemoMutationVariables = Exact<{ id: string }>;",
                "generated.ts",
                [{ operation: "DemoMutationVariables", path: "missing", type: "number" }]
            )
        ).toThrow('Property "missing" was not found');
    });

    it("继续拒绝非 operation 类型", () => {
        expect(() =>
            applyOperationTypeOverridesToSource("export type DemoVariables = { id: string };", "generated.ts", [
                { operation: "DemoVariables", path: "id", type: "number" },
            ])
        ).toThrow("Rule targets non-operation type");
    });
});
