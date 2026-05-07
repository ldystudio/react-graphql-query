import { dirname, relative, resolve } from "node:path";
import type {
    GraphqlCodegenBuildResult,
    GraphqlCodegenConfig,
    GraphqlCodegenDefinitionsConfig,
    GraphqlCodegenProjectConfig,
    GraphqlCodegenResolvedDefinitionsConfig,
    GraphqlCodegenResolvedTarget,
} from "./types";

const defaultCodegenPluginConfig = {
    avoidOptionals: {
        field: true,
        object: false,
        inputValue: false,
        defaultValue: false,
    },
    skipTypename: true,
    useTypeImports: true,
};

function toPosixPath(filePath: string) {
    return filePath.split("\\").join("/");
}

function trimTsExtension(filePath: string) {
    if (!filePath.endsWith(".ts")) {
        throw new Error(`[react-graphql-query/codegen] output must end with .ts: ${filePath}`);
    }

    return filePath.slice(0, -3);
}

function toRelativeImportPath(fromFilePath: string, toFilePath: string) {
    return relative(dirname(fromFilePath), trimTsExtension(toFilePath))
        .split("\\")
        .join("/")
        .replace(/^([^./])/, "./$1");
}

function resolveDefinitionsConfig(
    definitions: GraphqlCodegenDefinitionsConfig | undefined,
    outputPath: string,
    projectRoot: string
): GraphqlCodegenResolvedDefinitionsConfig | undefined {
    if (!definitions) {
        return undefined;
    }

    const definitionsOutputPath = resolve(projectRoot, definitions.output);

    return {
        ...definitions,
        outputPath: definitionsOutputPath,
        outputRelativePath: toPosixPath(relative(projectRoot, definitionsOutputPath)),
        generatedImportPath: definitions.generatedImportPath ?? toRelativeImportPath(definitionsOutputPath, outputPath),
        generatedImportName: definitions.generatedImportName ?? "Gen",
    };
}

export function buildGraphqlCodegenConfig(
    projectConfig: GraphqlCodegenProjectConfig,
    projectRoot: string
): GraphqlCodegenBuildResult {
    const generates: GraphqlCodegenConfig["generates"] = {};
    const resolvedTargets: GraphqlCodegenResolvedTarget[] = [];

    for (const [targetName, target] of Object.entries(projectConfig.targets)) {
        const outputPath = resolve(projectRoot, target.output);
        const tempOutputDirPath = trimTsExtension(outputPath);
        const outputRelativePath = toPosixPath(relative(projectRoot, outputPath));
        const tempOutputDirRelativePath = toPosixPath(relative(projectRoot, tempOutputDirPath));

        resolvedTargets.push({
            ...target,
            name: targetName,
            outputPath,
            outputRelativePath,
            tempOutputDirPath,
            tempOutputDirRelativePath,
            sourcePath: resolve(tempOutputDirPath, "graphql.ts"),
            definitions: resolveDefinitionsConfig(target.definitions, outputPath, projectRoot),
        });

        generates[`./${tempOutputDirRelativePath}/`] = {
            schema: target.schema,
            documents: target.documents,
            preset: "client",
            presetConfig: {
                fragmentMasking: false,
            },
            config: {
                ...defaultCodegenPluginConfig,
                ...target.config,
            },
        };
    }

    return {
        codegenConfig: {
            overwrite: true,
            generates,
        },
        resolvedTargets,
    };
}
