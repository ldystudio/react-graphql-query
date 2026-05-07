import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncGraphqlDefinitionsTarget } from "../codegen/definitions";
import type { GraphqlCodegenResolvedTarget } from "../codegen/types";

const tempDirs: string[] = [];

async function createTempDir() {
    const dirPath = await mkdtemp(join(tmpdir(), "react-graphql-query-definitions-"));
    tempDirs.push(dirPath);
    return dirPath;
}

async function writeGeneratedFile(rootDirPath: string, sourceText: string) {
    const outputPath = join(rootDirPath, "src/service/__generated__/main.ts");

    await mkdir(join(rootDirPath, "src/service/__generated__"), { recursive: true });
    await writeFile(outputPath, sourceText);

    return outputPath;
}

function createTarget(rootDirPath: string, outputPath: string): GraphqlCodegenResolvedTarget {
    return {
        name: "main",
        schema: "schema.graphql",
        documents: ["src/**/*.graphql"],
        output: "src/service/__generated__/main.ts",
        outputPath,
        outputRelativePath: "src/service/__generated__/main.ts",
        tempOutputDirPath: join(rootDirPath, "src/service/__generated__/main"),
        tempOutputDirRelativePath: "src/service/__generated__/main",
        sourcePath: join(rootDirPath, "src/service/__generated__/main/graphql.ts"),
        definitions: {
            output: "src/service/gql/main.gql.ts",
            outputPath: join(rootDirPath, "src/service/gql/main.gql.ts"),
            outputRelativePath: "src/service/gql/main.gql.ts",
            generatedImportPath: "../__generated__/main",
            generatedImportName: "Gen",
        },
    };
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe("codegen definitions", () => {
    it("为缺失 Document 创建 defineGraphql 定义", async () => {
        const rootDirPath = await createTempDir();
        const outputPath = await writeGeneratedFile(
            rootDirPath,
            `import type { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";

export type DemoQueryVariables = { id: string };
export type DemoQuery = { demo: { id: string } };
export const DemoDocument = {} as unknown as DocumentNode<DemoQuery, DemoQueryVariables>;
`
        );
        const target = createTarget(rootDirPath, outputPath);

        await syncGraphqlDefinitionsTarget(target);

        await expect(readFile(target.definitions?.outputPath ?? "", "utf8")).resolves.toBe(
            `import { defineGraphql } from "@ldystudio/react-graphql-query";
import * as Gen from "../__generated__/main";

export const DEMO = defineGraphql<Gen.DemoQuery, Gen.DemoQueryVariables>()({
    document: Gen.DemoDocument
});
`
        );
    });

    it("只追加缺失定义，不覆盖已有自定义配置", async () => {
        const rootDirPath = await createTempDir();
        const outputPath = await writeGeneratedFile(
            rootDirPath,
            `import type { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";

export type DemoQueryVariables = { id: string };
export type DemoQuery = { demo: { id: string } };
export type NextMutationVariables = { id: string };
export type NextMutation = { ok: boolean };
export const DemoDocument = {} as unknown as DocumentNode<DemoQuery, DemoQueryVariables>;
export const NextDocument = {} as unknown as DocumentNode<NextMutation, NextMutationVariables>;
`
        );
        const target = createTarget(rootDirPath, outputPath);

        await mkdir(join(rootDirPath, "src/service/gql"), { recursive: true });
        await writeFile(
            target.definitions?.outputPath ?? "",
            `import { defineGraphql } from "@ldystudio/react-graphql-query";
import * as Gen from "../__generated__/main";

export const DEMO = defineGraphql<DemoApi.Root, Gen.DemoQueryVariables>()({
    parseKey: "demo",
    document: Gen.DemoDocument
});
`
        );

        await syncGraphqlDefinitionsTarget(target);

        const outputText = await readFile(target.definitions?.outputPath ?? "", "utf8");

        expect(outputText).toContain("defineGraphql<DemoApi.Root, Gen.DemoQueryVariables>");
        expect(outputText).toContain('parseKey: "demo"');
        expect(outputText).toContain(
            "export const NEXT = defineGraphql<Gen.NextMutation, Gen.NextMutationVariables>()({\n    document: Gen.NextDocument\n});"
        );
    });

    it("支持给生成定义加 client 和 client import", async () => {
        const rootDirPath = await createTempDir();
        const outputPath = await writeGeneratedFile(
            rootDirPath,
            `import type { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";

export type RednoteResourceQueryVariables = {};
export type RednoteResourceQuery = { resourceInfo: string };
export const RednoteResourceDocument = {} as unknown as DocumentNode<RednoteResourceQuery, RednoteResourceQueryVariables>;
`
        );
        const target = createTarget(rootDirPath, outputPath);

        if (target.definitions) {
            target.definitions.client = {
                name: "Pipixia",
                importPath: "~/service/client",
            };
        }

        await syncGraphqlDefinitionsTarget(target);

        const outputText = await readFile(target.definitions?.outputPath ?? "", "utf8");

        expect(outputText).toContain('import { Pipixia } from "~/service/client";');
        expect(outputText).toContain("export const REDNOTE_RESOURCE =");
        expect(outputText).toContain("    client: Pipixia,");
    });
});
