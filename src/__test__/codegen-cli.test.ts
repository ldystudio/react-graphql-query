import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDirectExecutionTarget, loadProjectCodegen, loadProjectConfig, main, runFormatCommand } from "../codegen/cli";
import type { GraphqlCodegenProjectConfig } from "../codegen/types";

const tempDirs: string[] = [];

async function createTempDir() {
    const dirPath = await mkdtemp(join(tmpdir(), "react-graphql-query-cli-"));
    tempDirs.push(dirPath);
    return dirPath;
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe("codegen cli helpers", () => {
    it("从项目侧依赖加载 @graphql-codegen/cli", async () => {
        const projectRoot = await createTempDir();
        const codegenPackageDirPath = join(projectRoot, "node_modules/@graphql-codegen/cli");

        await mkdir(codegenPackageDirPath, { recursive: true });
        await writeFile(join(projectRoot, "package.json"), '{ "name": "fixture-project" }\n');
        await writeFile(
            join(codegenPackageDirPath, "package.json"),
            '{ "name": "@graphql-codegen/cli", "main": "./index.cjs", "type": "commonjs" }\n'
        );
        await writeFile(join(codegenPackageDirPath, "index.cjs"), 'module.exports = { source: "project-root" };\n');

        const loadedModule = loadProjectCodegen(projectRoot) as unknown as { source: string };

        expect(loadedModule).toEqual({ source: "project-root" });
    });

    it("format.command 默认吃生成文件列表", async () => {
        const projectRoot = await createTempDir();
        const markerPath = join(projectRoot, "formatted.json");
        const scriptPath = join(projectRoot, "format-success.js");
        const projectConfig: GraphqlCodegenProjectConfig = {
            targets: {},
            format: {
                command: [process.execPath, scriptPath, markerPath],
            },
        };

        await writeFile(
            scriptPath,
            [
                'const { writeFileSync } = require("node:fs");',
                "writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));",
            ].join("\n")
        );

        await runFormatCommand(projectConfig, ["src/main.ts", "src/pipixia.ts"]);

        expect(JSON.parse(await readFile(markerPath, "utf8"))).toEqual(["src/main.ts", "src/pipixia.ts"]);
    });

    it("format.command 非零退出码时报错", async () => {
        const projectRoot = await createTempDir();
        const scriptPath = join(projectRoot, "format-fail.js");
        const projectConfig: GraphqlCodegenProjectConfig = {
            targets: {},
            format: {
                command: [process.execPath, scriptPath],
            },
        };

        await writeFile(scriptPath, "process.exit(2);\n");

        await expect(runFormatCommand(projectConfig, ["src/main.ts"])).rejects.toThrow(
            "format command failed with exit code 2"
        );
    });

    it("通过 bin symlink 执行时仍能识别为直接执行", async () => {
        const projectRoot = await createTempDir();
        const realCliPath = join(projectRoot, "dist/codegen/cli.js");
        const symlinkCliPath = join(projectRoot, "node_modules/.bin/react-graphql-query-codegen");

        await mkdir(join(projectRoot, "dist/codegen"), { recursive: true });
        await mkdir(join(projectRoot, "node_modules/.bin"), { recursive: true });
        await writeFile(realCliPath, 'console.log("cli");\n');
        await symlink(realCliPath, symlinkCliPath);

        expect(isDirectExecutionTarget(symlinkCliPath, realCliPath)).toBe(true);
    });

    it("加载项目配置时支持 tsconfig paths 别名", async () => {
        const projectRoot = await createTempDir();
        const configPath = join(projectRoot, "scripts/codegen/config.ts");

        await mkdir(join(projectRoot, "scripts/codegen"), { recursive: true });
        await mkdir(join(projectRoot, "src/common"), { recursive: true });
        await writeFile(
            join(projectRoot, "tsconfig.json"),
            JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } })
        );
        await writeFile(
            join(projectRoot, "src/common/Constants.ts"),
            'export const TEST_SERVICE_DOMAIN = { graphql: "https://example.com/graphql" };\n'
        );
        await writeFile(
            configPath,
            [
                'import { TEST_SERVICE_DOMAIN } from "@/common/Constants";',
                "export default {",
                "    targets: {",
                "        main: {",
                "            schema: TEST_SERVICE_DOMAIN.graphql,",
                '            documents: ["src/main.graphql"],',
                '            output: "src/generated/main.ts",',
                "        },",
                "    },",
                "};",
            ].join("\n")
        );

        const loadedConfig = await loadProjectConfig(configPath, projectRoot);

        expect(loadedConfig.targets.main.schema).toBe("https://example.com/graphql");
    });

    it("加载项目配置时可用 react-native-web 代替 react-native", async () => {
        const projectRoot = await createTempDir();
        const configPath = join(projectRoot, "scripts/codegen/config.ts");
        const reactNativeWebPath = join(projectRoot, "node_modules/react-native-web");

        await mkdir(join(projectRoot, "scripts/codegen"), { recursive: true });
        await mkdir(join(projectRoot, "src/common"), { recursive: true });
        await mkdir(reactNativeWebPath, { recursive: true });
        await writeFile(join(projectRoot, "package.json"), '{ "name": "fixture-project" }\n');
        await writeFile(
            join(projectRoot, "tsconfig.json"),
            JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } })
        );
        await writeFile(
            join(reactNativeWebPath, "package.json"),
            '{ "name": "react-native-web", "main": "./index.cjs", "type": "commonjs" }\n'
        );
        await writeFile(
            join(reactNativeWebPath, "index.cjs"),
            "exports.Dimensions = { get: () => ({ width: 1200 }) };\n"
        );
        await writeFile(
            join(projectRoot, "src/common/Constants.ts"),
            [
                'import { Dimensions } from "react-native";',
                'export const TEST_SERVICE_DOMAIN = { graphql: "https://example.com/graphql" };',
                "export const SCREEN_WIDTH = Dimensions.get('window').width;",
            ].join("\n")
        );
        await writeFile(
            configPath,
            [
                'import { SCREEN_WIDTH, TEST_SERVICE_DOMAIN } from "@/common/Constants";',
                "export default {",
                "    targets: {},",
                "    schema: TEST_SERVICE_DOMAIN.graphql,",
                "    width: SCREEN_WIDTH,",
                "};",
            ].join("\n")
        );

        const loadedConfig = await loadProjectConfig(configPath, projectRoot);

        expect(loadedConfig).toMatchObject({
            schema: "https://example.com/graphql",
            width: 1200,
        });
    });

    it("找不到 tsconfig 时回退到项目根并返回空别名映射", async () => {
        const projectRoot = await createTempDir();
        const configPath = join(projectRoot, "config.ts");

        await writeFile(configPath, "export default { targets: {} };\n");

        // projectRoot 传子目录，使 dirname(configPath) 不在 projectRoot 之下 → 跳过向上查找
        const subRoot = join(projectRoot, "sub");
        const loadedConfig = await loadProjectConfig(configPath, subRoot);

        expect(loadedConfig.targets).toEqual({});
    });

    it("tsconfig 内容非法时回退为空别名映射", async () => {
        const projectRoot = await createTempDir();
        const configPath = join(projectRoot, "scripts/codegen/config.ts");

        await mkdir(join(projectRoot, "scripts/codegen"), { recursive: true });
        await writeFile(join(projectRoot, "tsconfig.json"), "{ 非法 JSON !!!");
        await writeFile(configPath, "export default { targets: {} };\n");

        const loadedConfig = await loadProjectConfig(configPath, projectRoot);

        expect(loadedConfig.targets).toEqual({});
    });

    it("tsconfig 无 paths 时返回空别名映射", async () => {
        const projectRoot = await createTempDir();
        const configPath = join(projectRoot, "scripts/codegen/config.ts");

        await mkdir(join(projectRoot, "scripts/codegen"), { recursive: true });
        await writeFile(join(projectRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: "." } }));
        await writeFile(configPath, "export default { targets: {} };\n");

        const loadedConfig = await loadProjectConfig(configPath, projectRoot);

        expect(loadedConfig.targets).toEqual({});
    });

    it("paths 空数组或空 key 的别名被过滤", async () => {
        const projectRoot = await createTempDir();
        const configPath = join(projectRoot, "scripts/codegen/config.ts");

        await mkdir(join(projectRoot, "scripts/codegen"), { recursive: true });
        await writeFile(
            join(projectRoot, "tsconfig.json"),
            JSON.stringify({
                compilerOptions: {
                    paths: {
                        "@empty/*": [],
                        "*": ["./src/*"],
                        "@ok/*": ["./src/*"],
                    },
                },
            })
        );
        await writeFile(configPath, 'import { x } from "@ok/common";\nexport default { targets: {}, ok: x };\n');
        await mkdir(join(projectRoot, "src"), { recursive: true });
        await writeFile(join(projectRoot, "src/common.ts"), "export const x = 1;\n");

        // @empty/* 无 target 被过滤；* 的 alias key 为空被过滤；@ok/* 正常保留
        const loadedConfig = await loadProjectConfig(configPath, projectRoot);

        expect(loadedConfig.targets).toEqual({});
        expect((loadedConfig as unknown as { ok: number }).ok).toBe(1);
    });

    it("runFormatCommand 无 format 时直接返回", async () => {
        await expect(runFormatCommand({ targets: {} }, ["src/main.ts"])).resolves.toBeUndefined();
    });

    it("runFormatCommand 空 command 时抛错", async () => {
        await expect(runFormatCommand({ targets: {}, format: { command: [] } }, ["src/main.ts"])).rejects.toThrow(
            "[react-graphql-query/codegen] format.command must not be empty"
        );
    });

    it("isDirectExecutionTarget 空 entryPath 时返回 false", () => {
        expect(isDirectExecutionTarget(undefined, join("some", "module.js"))).toBe(false);
    });

    it("main 缺少 --config 时打印用法并退出码 1", async () => {
        const savedArgv = process.argv;
        const savedExitCode = process.exitCode;
        const savedError = console.error;
        const printed: string[] = [];

        try {
            console.error = (...args: unknown[]) => {
                printed.push(args.join(" "));
            };
            process.argv = ["bun", "cli"];
            await main();
            expect(process.exitCode).toBe(1);
            expect(printed.join("\n")).toContain("Usage: react-graphql-query-codegen --config");
        } finally {
            console.error = savedError;
            process.argv = savedArgv;
            // bun test 会把曾设置的非零 exitCode 记为失败信号，即便后续改回 undefined。
            // 恢复为 0 以清除该状态，保证测试进程正常退出。
            process.exitCode = savedExitCode ?? 0;
        }
    });

    it("main 完整流程：mock codegen/cli 生成 + prune + format", async () => {
        const projectRoot = await createTempDir();
        const savedCwd = process.cwd();
        const savedArgv = process.argv;
        const savedExitCode = process.exitCode;

        try {
            // 项目结构与 mock @graphql-codegen/cli
            const codegenPackageDirPath = join(projectRoot, "node_modules/@graphql-codegen/cli");
            await mkdir(codegenPackageDirPath, { recursive: true });
            await writeFile(join(projectRoot, "package.json"), '{ "name": "fixture-project" }\n');
            await writeFile(
                join(codegenPackageDirPath, "package.json"),
                '{ "name": "@graphql-codegen/cli", "main": "./index.cjs", "type": "commonjs" }\n'
            );
            const tempOutputRelative = "src/service/__generated__/main";
            await writeFile(
                join(codegenPackageDirPath, "index.cjs"),
                [
                    'const { mkdirSync, writeFileSync } = require("node:fs");',
                    "module.exports = { generate: async (config) => {",
                    `  const dir = "./${tempOutputRelative}/";`,
                    "  mkdirSync(dir, { recursive: true });",
                    `  writeFileSync("${tempOutputRelative}/graphql.ts", `,
                    '    "import type { TypedDocumentNode as DocumentNode } from \\"@graphql-typed-document-node/core\\";\\n" +',
                    '    "export type DemoQuery = { item: string } | null;\\n" +',
                    '    "export type DemoQueryVariables = { id: string | null };\\n" +',
                    '    "export const DemoDocument = {} as DocumentNode<DemoQuery, DemoQueryVariables>;\\n");',
                    "  return {};",
                    "} };",
                ].join("\n")
            );

            // 目标输出目录
            const outputPath = join(projectRoot, "src/service/__generated__/main.ts");
            await mkdir(join(projectRoot, "src/service/__generated__"), { recursive: true });

            // format 脚本：写入标记文件
            const markerPath = join(projectRoot, "formatted.json");
            const formatScriptPath = join(projectRoot, "format.js");
            await writeFile(
                formatScriptPath,
                [
                    'const { writeFileSync } = require("node:fs");',
                    "writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));",
                ].join("\n")
            );

            // 配置
            const configPath = join(projectRoot, "scripts/codegen/config.ts");
            await mkdir(join(projectRoot, "scripts/codegen"), { recursive: true });
            await writeFile(
                configPath,
                [
                    "export default {",
                    "  targets: {",
                    "    main: {",
                    '      schema: "schema.graphql",',
                    '      documents: ["src/main.graphql"],',
                    `      output: "src/service/__generated__/main.ts",`,
                    "    },",
                    "  },",
                    "  format: {",
                    `    command: [process.execPath, ${JSON.stringify(formatScriptPath)}, ${JSON.stringify(markerPath)}],`,
                    "  },",
                    "};",
                ].join("\n")
            );

            process.chdir(projectRoot);
            process.argv = ["bun", "cli", "--config", "scripts/codegen/config.ts"];

            await main();

            // prune 后的输出存在，format 被调用
            const prunedSource = await readFile(outputPath, "utf8");
            expect(prunedSource).toContain("DemoQuery");
            const formattedFiles = JSON.parse(await readFile(markerPath, "utf8"));
            expect(formattedFiles).toContain("src/service/__generated__/main.ts");
        } finally {
            process.chdir(savedCwd);
            process.argv = savedArgv;
            process.exitCode = savedExitCode;
        }
    });
});
