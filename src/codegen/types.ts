export interface GraphqlCodegenTargetTransformContext {
    projectRoot: string;
    targetName: string;
    outputPath: string;
    tempOutputDirPath: string;
}

export interface GraphqlCodegenGenerateTargetConfig {
    schema: string;
    documents: string[];
    preset: "client";
    presetConfig: {
        fragmentMasking: false;
    };
    config: Record<string, unknown>;
}

export interface GraphqlCodegenConfig {
    overwrite: true;
    generates: Record<string, GraphqlCodegenGenerateTargetConfig>;
}

export interface GraphqlCodegenBuildResult {
    codegenConfig: GraphqlCodegenConfig;
    resolvedTargets: GraphqlCodegenResolvedTarget[];
}

export interface GraphqlCodegenModule {
    generate: (config: GraphqlCodegenConfig, saveToFile?: boolean) => Promise<unknown>;
}

export interface GraphqlCodegenOperationTypeOverrideRule {
    operation: string;
    path: string;
    type: string;
}

export interface GraphqlCodegenTargetOverridesConfig {
    operationTypes?: GraphqlCodegenOperationTypeOverrideRule[];
}

export type GraphqlCodegenSourceTransform = (
    sourceText: string,
    context: GraphqlCodegenTargetTransformContext
) => Promise<string> | string;

export interface GraphqlCodegenTargetConfig {
    schema: string;
    documents: string[];
    output: string;
    config?: Record<string, unknown>;
    overrides?: GraphqlCodegenTargetOverridesConfig;
    stripNullishFromOperationTypes?: boolean;
    transformSource?: GraphqlCodegenSourceTransform;
}

export interface GraphqlCodegenFormatConfig {
    command: string[];
    files?: string[];
}

export interface GraphqlCodegenProjectConfig {
    targets: Record<string, GraphqlCodegenTargetConfig>;
    format?: GraphqlCodegenFormatConfig;
}

export interface GraphqlCodegenResolvedTarget extends GraphqlCodegenTargetConfig {
    name: string;
    outputPath: string;
    outputRelativePath: string;
    tempOutputDirPath: string;
    tempOutputDirRelativePath: string;
    sourcePath: string;
}
