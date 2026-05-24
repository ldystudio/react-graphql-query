#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { parseConfigFileTextToJson } from "typescript";
import { buildGraphqlCodegenConfig } from "./build-config";
import { syncGraphqlDefinitionsTarget } from "./definitions";
import { pruneGeneratedTarget } from "./prune";
import type { GraphqlCodegenModule, GraphqlCodegenProjectConfig } from "./types";

function getArgValue(flag: string) {
    const index = process.argv.indexOf(flag);
    if (index === -1) {
        return undefined;
    }

    return process.argv[index + 1];
}

function printUsage() {
    console.error("Usage: react-graphql-query-codegen --config <path-to-config>");
}

type TsConfigJson = {
    compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[]>;
    };
};

function findTsConfig(configPath: string, projectRoot: string) {
    let currentDir = dirname(configPath);
    const rootDir = resolve(projectRoot);

    while (currentDir.startsWith(rootDir)) {
        const tsconfigPath = join(currentDir, "tsconfig.json");
        if (existsSync(tsconfigPath)) {
            return tsconfigPath;
        }

        const parentDir = dirname(currentDir);
        if (parentDir === currentDir) {
            break;
        }
        currentDir = parentDir;
    }

    const rootTsConfigPath = join(rootDir, "tsconfig.json");
    return existsSync(rootTsConfigPath) ? rootTsConfigPath : undefined;
}

function normalizePathAlias(aliasKey: string, aliasTargets: string[], baseDir: string) {
    const aliasTarget = aliasTargets[0];
    if (!aliasTarget) {
        return undefined;
    }

    const keyStarIndex = aliasKey.indexOf("*");
    const targetStarIndex = aliasTarget.indexOf("*");
    const jitiAliasKey = keyStarIndex === -1 ? aliasKey : aliasKey.slice(0, keyStarIndex);
    const targetPrefix = targetStarIndex === -1 ? aliasTarget : aliasTarget.slice(0, targetStarIndex);

    if (!jitiAliasKey) {
        return undefined;
    }

    return [jitiAliasKey, resolve(baseDir, targetPrefix)] as const;
}

function loadTsConfigPathAliases(configPath: string, projectRoot: string) {
    const tsconfigPath = findTsConfig(configPath, projectRoot);
    if (!tsconfigPath) {
        return {};
    }

    const parsedConfig = parseConfigFileTextToJson(tsconfigPath, readFileSync(tsconfigPath, "utf8"));
    if (parsedConfig.error) {
        return {};
    }

    const tsconfig = parsedConfig.config as TsConfigJson;
    const paths = tsconfig.compilerOptions?.paths;
    if (!paths) {
        return {};
    }

    const configDir = dirname(tsconfigPath);
    const baseDir = resolve(configDir, tsconfig.compilerOptions?.baseUrl ?? ".");
    return Object.fromEntries(
        Object.entries(paths)
            .map(([aliasKey, aliasTargets]) => normalizePathAlias(aliasKey, aliasTargets, baseDir))
            .filter((entry): entry is readonly [string, string] => Boolean(entry))
    );
}

function loadProjectVirtualModules(projectRoot: string) {
    const projectRequire = createRequire(resolve(projectRoot, "package.json"));

    try {
        return {
            "react-native": projectRequire("react-native-web") as unknown,
        };
    } catch {
        return {};
    }
}

export async function loadProjectConfig(configPath: string, projectRoot = process.cwd()) {
    const jiti = createJiti(import.meta.url, {
        moduleCache: false,
        fsCache: false,
        alias: loadTsConfigPathAliases(configPath, projectRoot),
        virtualModules: loadProjectVirtualModules(projectRoot),
    });
    const loadedModule = await jiti.import<GraphqlCodegenProjectConfig>(configPath);

    return (loadedModule as { default?: GraphqlCodegenProjectConfig }).default ?? loadedModule;
}

export function loadProjectCodegen(projectRoot: string) {
    const projectRequire = createRequire(resolve(projectRoot, "package.json"));
    return projectRequire("@graphql-codegen/cli") as GraphqlCodegenModule;
}

export async function runFormatCommand(projectConfig: GraphqlCodegenProjectConfig, generatedFiles: string[]) {
    if (!projectConfig.format) {
        return;
    }

    const [command, ...args] = projectConfig.format.command;
    if (!command) {
        throw new Error("[react-graphql-query/codegen] format.command must not be empty");
    }

    const files = projectConfig.format.files ?? generatedFiles;

    await new Promise<void>((resolvePromise, rejectPromise) => {
        const child = spawn(command, [...args, ...files], {
            cwd: process.cwd(),
            stdio: "inherit",
        });

        child.on("error", rejectPromise);
        child.on("exit", (code) => {
            if (code === 0) {
                resolvePromise();
                return;
            }

            rejectPromise(new Error(`[react-graphql-query/codegen] format command failed with exit code ${code ?? 1}`));
        });
    });
}

export async function main() {
    const configArg = getArgValue("--config");
    if (!configArg) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    const projectRoot = process.cwd();
    const configPath = resolve(projectRoot, configArg);
    const projectConfig = await loadProjectConfig(configPath);
    const { codegenConfig, resolvedTargets } = buildGraphqlCodegenConfig(projectConfig, projectRoot);
    const { generate } = loadProjectCodegen(projectRoot);

    await generate(codegenConfig, true);

    for (const target of resolvedTargets) {
        await pruneGeneratedTarget(target);
    }

    const definitionFiles = (
        await Promise.all(resolvedTargets.map((target) => syncGraphqlDefinitionsTarget(target)))
    ).filter((filePath): filePath is string => Boolean(filePath));

    await runFormatCommand(projectConfig, [
        ...resolvedTargets.map((target) => target.outputRelativePath),
        ...definitionFiles,
    ]);
}

export function isDirectExecutionTarget(entryPath: string | undefined, modulePath: string) {
    if (!entryPath) {
        return false;
    }

    return realpathSync(resolve(entryPath)) === realpathSync(modulePath);
}

function isDirectExecution() {
    return isDirectExecutionTarget(process.argv[1], fileURLToPath(import.meta.url));
}

if (isDirectExecution()) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
