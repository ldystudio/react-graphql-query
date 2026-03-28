import type { ResetOptions } from "@tanstack/query-core";
import type { InvalidateOptions, InvalidateQueryFilters, QueryClient, QueryKey } from "@tanstack/react-query";
import { getGraphQueryKey, getParsePath, getValueByParseKey } from "./key";
import type { AnyGraphqlDefinition, GraphQueryData, GraphQueryDataUpdater } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function setValueAtPath(currentValue: unknown, path: string[], nextValue: unknown): unknown {
    if (path.length === 0) {
        return nextValue;
    }

    const [head, ...tail] = path;
    const source = isRecord(currentValue) ? currentValue : {};

    return {
        ...source,
        [head]: setValueAtPath(source[head], tail, nextValue),
    };
}

function resolveUpdater<TData>(updater: GraphQueryDataUpdater<TData>, currentData: TData | undefined) {
    return typeof updater === "function"
        ? (updater as (data: TData | undefined) => TData | undefined)(currentData)
        : updater;
}

function toQueryFilters<TDefinition extends AnyGraphqlDefinition>(
    definition: TDefinition,
    variables?: import("./definition").GraphqlDefinitionVariables<TDefinition>
): Pick<InvalidateQueryFilters, "queryKey"> {
    return {
        queryKey: getGraphQueryKey(definition, variables),
    };
}

export function getGraphData<TDefinition extends AnyGraphqlDefinition>(
    queryClient: QueryClient,
    definition: TDefinition,
    variables?: import("./definition").GraphqlDefinitionVariables<TDefinition>
) {
    const rootData = queryClient.getQueryData(queryKeyOf(definition, variables));

    if (rootData == null) {
        return undefined;
    }

    return getValueByParseKey(rootData, definition) as GraphQueryData<TDefinition>;
}

export function setGraphData<TDefinition extends AnyGraphqlDefinition>(
    queryClient: QueryClient,
    definition: TDefinition,
    variables: import("./definition").GraphqlDefinitionVariables<TDefinition> | undefined,
    updater: GraphQueryDataUpdater<GraphQueryData<TDefinition>>
) {
    const queryKey = queryKeyOf(definition, variables);
    const parsePath = getParsePath(definition);

    return queryClient.setQueryData(queryKey, (currentRootData) => {
        const currentData =
            currentRootData == null
                ? undefined
                : (getValueByParseKey(currentRootData, definition) as GraphQueryData<TDefinition>);
        const nextData = resolveUpdater(updater, currentData);

        if (nextData === undefined) {
            return undefined;
        }

        return setValueAtPath(currentRootData, parsePath, nextData);
    }) as GraphQueryData<TDefinition> | undefined;
}

export function invalidateGraphQuery<TDefinition extends AnyGraphqlDefinition>(
    queryClient: QueryClient,
    definition: TDefinition,
    variables?: import("./definition").GraphqlDefinitionVariables<TDefinition>,
    options?: InvalidateOptions
) {
    return queryClient.invalidateQueries(toQueryFilters(definition, variables), options);
}

export function cancelGraphQuery<TDefinition extends AnyGraphqlDefinition>(
    queryClient: QueryClient,
    definition: TDefinition,
    variables?: import("./definition").GraphqlDefinitionVariables<TDefinition>,
    options?: CancelOptions
) {
    return queryClient.cancelQueries(toQueryFilters(definition, variables), options);
}

export function removeGraphQuery<TDefinition extends AnyGraphqlDefinition>(
    queryClient: QueryClient,
    definition: TDefinition,
    variables?: import("./definition").GraphqlDefinitionVariables<TDefinition>
) {
    return queryClient.removeQueries(toQueryFilters(definition, variables));
}

export function resetGraphQuery<TDefinition extends AnyGraphqlDefinition>(
    queryClient: QueryClient,
    definition: TDefinition,
    variables?: import("./definition").GraphqlDefinitionVariables<TDefinition>,
    options?: ResetOptions
) {
    return queryClient.resetQueries(toQueryFilters(definition, variables), options);
}

export function queryKeyOf<TDefinition extends AnyGraphqlDefinition>(
    definition: TDefinition,
    variables?: import("./definition").GraphqlDefinitionVariables<TDefinition>
) {
    return getGraphQueryKey(definition, variables) as QueryKey;
}

type CancelOptions = {
    revert?: boolean;
    silent?: boolean;
};
