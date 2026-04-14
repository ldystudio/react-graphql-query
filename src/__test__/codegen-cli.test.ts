import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDirectExecutionTarget, loadProjectCodegen, runFormatCommand } from "../codegen/cli";
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
});
