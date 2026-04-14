#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { buildGraphqlCodegenConfig } from "./build-config";
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

export async function loadProjectConfig(configPath: string) {
    const jiti = createJiti(import.meta.url, {
        moduleCache: false,
        fsCache: false,
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

    await runFormatCommand(
        projectConfig,
        resolvedTargets.map((target) => target.outputRelativePath)
    );
}

function isDirectExecution() {
    const entryPath = process.argv[1];

    if (!entryPath) {
        return false;
    }

    return resolve(entryPath) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
