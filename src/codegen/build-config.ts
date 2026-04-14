import { relative, resolve } from "node:path";
import type {
    GraphqlCodegenBuildResult,
    GraphqlCodegenConfig,
    GraphqlCodegenProjectConfig,
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
