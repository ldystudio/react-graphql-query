import { describe, expect, it } from "bun:test";
import { buildGraphqlCodegenConfig } from "../codegen/build-config";

describe("codegen build config", () => {
    it("生成 client preset 输出目录与 resolved target 元信息", () => {
        const { codegenConfig, resolvedTargets } = buildGraphqlCodegenConfig(
            {
                targets: {
                    main: {
                        schema: "https://example.com/graphql",
                        documents: ["src/**/*.graphql"],
                        output: "src/service/__generated__/main.ts",
                        definitions: {
                            output: "src/service/gql/main.gql.ts",
                        },
                        config: {
                            enumsAsConst: true,
                        },
                        overrides: {
                            operationTypes: [
                                {
                                    operation: "DemoQuery",
                                    path: "item",
                                    type: "SharedThing",
                                },
                            ],
                        },
                        stripNullishFromOperationTypes: false,
                    },
                },
            },
            "/repo"
        );

        expect(codegenConfig).toEqual({
            overwrite: true,
            generates: {
                "./src/service/__generated__/main/": {
                    schema: "https://example.com/graphql",
                    documents: ["src/**/*.graphql"],
                    preset: "client",
                    presetConfig: {
                        fragmentMasking: false,
                    },
                    config: {
                        avoidOptionals: {
                            field: true,
                            object: false,
                            inputValue: false,
                            defaultValue: false,
                        },
                        skipTypename: true,
                        useTypeImports: true,
                        enumsAsConst: true,
                    },
                },
            },
        });
        expect(resolvedTargets).toEqual([
            {
                name: "main",
                schema: "https://example.com/graphql",
                documents: ["src/**/*.graphql"],
                output: "src/service/__generated__/main.ts",
                definitions: {
                    output: "src/service/gql/main.gql.ts",
                    outputPath: "/repo/src/service/gql/main.gql.ts",
                    outputRelativePath: "src/service/gql/main.gql.ts",
                    generatedImportPath: "../__generated__/main",
                    generatedImportName: "Gen",
                },
                config: {
                    enumsAsConst: true,
                },
                overrides: {
                    operationTypes: [
                        {
                            operation: "DemoQuery",
                            path: "item",
                            type: "SharedThing",
                        },
                    ],
                },
                stripNullishFromOperationTypes: false,
                outputPath: "/repo/src/service/__generated__/main.ts",
                outputRelativePath: "src/service/__generated__/main.ts",
                tempOutputDirPath: "/repo/src/service/__generated__/main",
                tempOutputDirRelativePath: "src/service/__generated__/main",
                sourcePath: "/repo/src/service/__generated__/main/graphql.ts",
            },
        ]);
    });

    it("拒绝非 .ts 输出文件", () => {
        expect(() =>
            buildGraphqlCodegenConfig(
                {
                    targets: {
                        main: {
                            schema: "https://example.com/graphql",
                            documents: ["src/**/*.graphql"],
                            output: "src/service/__generated__/main.js",
                        },
                    },
                },
                "/repo"
            )
        ).toThrow("output must end with .ts");
    });
});
