import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDirectExecutionTarget, loadProjectCodegen, loadProjectConfig, runFormatCommand } from "../codegen/cli";
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
});
