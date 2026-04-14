import type { GraphqlCodegenProjectConfig } from "./types";

export function defineGraphqlCodegenProject<const TConfig extends GraphqlCodegenProjectConfig>(config: TConfig) {
    return config;
}
