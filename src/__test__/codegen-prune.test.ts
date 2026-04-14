import { afterEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneGeneratedTarget } from "../codegen/prune";
import type { GraphqlCodegenResolvedTarget, GraphqlCodegenTargetTransformContext } from "../codegen/types";

const tempDirs: string[] = [];

async function createTempDir() {
    const dirPath = await mkdtemp(join(tmpdir(), "react-graphql-query-codegen-"));
    tempDirs.push(dirPath);
    return dirPath;
}

async function writeGeneratedTargetFixture(
    options: Partial<GraphqlCodegenResolvedTarget> = {}
): Promise<GraphqlCodegenResolvedTarget> {
    const rootDirPath = await createTempDir();
    const tempOutputDirPath = join(rootDirPath, "src/service/__generated__/main");
    const outputPath = join(rootDirPath, "src/service/__generated__/main.ts");
    const sourcePath = join(tempOutputDirPath, "graphql.ts");

    await mkdir(tempOutputDirPath, { recursive: true });
    await writeFile(join(tempOutputDirPath, "shared.ts"), "export type SharedThing = { id: string };\n");
    await writeFile(
        sourcePath,
        `/* eslint-disable */
import type { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";
import type { SharedThing } from "./shared";

export type DemoQuery = {
    item: Record<string, SharedThing> | null;
} | null;

export type DemoOverrideQuery = {
    course: {
        list: Array<{
            desc: string | null;
        }> | null;
    } | null;
} | null;

export type DemoQueryVariables = {
    id: string | null;
};

export type UnusedType = {
    skip: true;
};

export const DemoDocument = {} as DocumentNode<DemoQuery, DemoQueryVariables>;
export const DemoOverrideDocument = {} as DocumentNode<DemoOverrideQuery, DemoQueryVariables>;
`
    );

    return {
        name: "main",
        schema: "schema.graphql",
        documents: ["src/**/*.graphql"],
        output: "src/service/__generated__/main.ts",
        outputPath,
        outputRelativePath: "src/service/__generated__/main.ts",
        tempOutputDirPath,
        tempOutputDirRelativePath: "src/service/__generated__/main",
        sourcePath,
        ...options,
    };
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe("codegen prune", () => {
    it("裁剪为 Document 依赖树，并处理 import/nullish/transform/清理临时目录", async () => {
        let transformContext: GraphqlCodegenTargetTransformContext | undefined;
        const target = await writeGeneratedTargetFixture({
            transformSource: (sourceText, context) => {
                transformContext = context;
                return `${sourceText}\n\nexport const transformed = true;\n`;
            },
        });

        await pruneGeneratedTarget(target);

        const outputText = await readFile(target.outputPath, "utf8");

        expect(outputText.startsWith("/* eslint-disable */")).toBe(false);
        expect(outputText).toContain('from "./main/shared"');
        expect(outputText).toContain(
            "export type DemoQuery = {\n    item: globalThis.Record<string, SharedThing>;\n};"
        );
        expect(outputText).toContain("export type DemoQueryVariables = {\n    id: string | null;\n};");
        expect(outputText).toContain("export const DemoDocument = {} as DocumentNode<DemoQuery, DemoQueryVariables>;");
        expect(outputText).toContain("export const transformed = true;");
        expect(outputText).not.toContain("UnusedType");
        expect(transformContext).toEqual({
            projectRoot: process.cwd(),
            targetName: "main",
            outputPath: target.outputPath,
            tempOutputDirPath: target.tempOutputDirPath,
        });
        expect(existsSync(target.tempOutputDirPath)).toBe(false);
    });

    it("允许关闭 operation type 的 nullish 清理", async () => {
        const target = await writeGeneratedTargetFixture({
            stripNullishFromOperationTypes: false,
        });

        await pruneGeneratedTarget(target);

        const outputText = await readFile(target.outputPath, "utf8");

        expect(outputText).toContain(
            "export type DemoQuery = {\n    item: globalThis.Record<string, SharedThing> | null;\n} | null;"
        );
    });

    it("应用 operation type overrides，并忽略当前 target 不存在的 operation 规则", async () => {
        const target = await writeGeneratedTargetFixture({
            overrides: {
                operationTypes: [
                    {
                        operation: "DemoOverrideQuery",
                        path: "course.list[].desc",
                        type: "SharedThing",
                    },
                    {
                        operation: "OtherQuery",
                        path: "course.list[].desc",
                        type: "SharedThing",
                    },
                ],
            },
        });

        await pruneGeneratedTarget(target);

        const outputText = await readFile(target.outputPath, "utf8");

        expect(outputText).toContain(
            "export type DemoOverrideQuery = {\n    course: {\n        list: Array<{\n            desc: SharedThing;\n        }>;\n    };\n};"
        );
    });

    it("在保留 nullish operation types 时也能应用 overrides", async () => {
        const target = await writeGeneratedTargetFixture({
            stripNullishFromOperationTypes: false,
            overrides: {
                operationTypes: [
                    {
                        operation: "DemoOverrideQuery",
                        path: "course.list[].desc",
                        type: "SharedThing",
                    },
                ],
            },
        });

        await pruneGeneratedTarget(target);

        const outputText = await readFile(target.outputPath, "utf8");

        expect(outputText).toContain(
            "export type DemoOverrideQuery = {\n    course: {\n        list: Array<{\n            desc: SharedThing;\n        }> | null;\n    } | null;\n} | null;"
        );
    });

    it("当当前 target 中存在 operation 但 override path 未命中时抛错", async () => {
        const target = await writeGeneratedTargetFixture({
            overrides: {
                operationTypes: [
                    {
                        operation: "DemoOverrideQuery",
                        path: "course.missing[].desc",
                        type: "SharedThing",
                    },
                ],
            },
        });

        await expect(pruneGeneratedTarget(target)).rejects.toThrow('Property "missing" was not found');
    });
});
