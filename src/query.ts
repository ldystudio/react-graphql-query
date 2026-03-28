import { queryOptions } from "@tanstack/react-query";
import type { GraphQLClient, RequestOptions } from "graphql-request";
import type { GraphqlDefinitionDocument, GraphqlDefinitionRoot, GraphqlDefinitionVariables } from "./definition";
import { createInitialDataByParseKey, getGraphQueryKey } from "./key";
import {
    GRAPH_DEBUG_PARSE_KEY_HEADER,
    getGraphClient,
    requestGraphRootData,
    resolveGraphVariables,
    selectGraphData,
    withDebugParseKeyHeader,
} from "./runtime";
import type {
    AnyGraphqlDefinition,
    GraphQueryData,
    GraphQueryOptions,
    GraphQueryOptionsResult,
    UseGraphQueryOptions,
} from "./types";

type GraphqlRuntimeDefinition = AnyGraphqlDefinition & Record<string, unknown>;
type GraphQueryRuntimeOptions = {
    debugParseKeyHeader?: boolean;
};

type GraphQueryContext<TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>> = {
    client: GraphQLClient;
    document: GraphqlDefinitionDocument<TDefinition>;
    parseKey: string;
    variables?: GraphqlDefinitionVariables<TDefinition>;
    requestHeaders?: RequestOptions["requestHeaders"];
    select?: (data: GraphQueryData<TDefinition>) => TData;
    wrappedInitialData?: GraphqlDefinitionRoot<TDefinition>;
    queryOptions: Record<string, unknown>;
};

function resolveGraphQueryContext<const TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>>(
    definition: TDefinition,
    options?: UseGraphQueryOptions<TDefinition, TData>,
    runtime?: GraphQueryRuntimeOptions
): GraphQueryContext<TDefinition, TData> {
    const runtimeDefinition = definition as GraphqlRuntimeDefinition;
    const {
        __rootType: _rootType,
        __variablesType: _variablesType,
        client: _definitionClient,
        key: _definitionKey,
        ...definitionQueryOptions
    } = runtimeDefinition;
    const document = runtimeDefinition.document as GraphqlDefinitionDocument<TDefinition>;
    const parseKey = runtimeDefinition.parseKey as string;
    const definitionVariables = runtimeDefinition.variables as GraphqlDefinitionVariables<TDefinition> | undefined;
    const { client, initialData, requestHeaders, select, variables, ...runtimeOptions } = options ?? {};

    return {
        client: getGraphClient(definition, { client }),
        document,
        parseKey,
        variables: resolveGraphVariables(definitionVariables, variables),
        requestHeaders: withDebugParseKeyHeader(requestHeaders, parseKey, runtime?.debugParseKeyHeader ?? false),
        select,
        wrappedInitialData:
            initialData == null
                ? undefined
                : (createInitialDataByParseKey(definition, initialData) as GraphqlDefinitionRoot<TDefinition>),
        queryOptions: {
            ...definitionQueryOptions,
            ...runtimeOptions,
        },
    };
}

export function graphQueryOptions<const TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>>(
    definition: TDefinition,
    options?: UseGraphQueryOptions<TDefinition, TData>
): GraphQueryOptionsResult<GraphqlDefinitionRoot<TDefinition>, TData> {
    return graphQueryOptionsWithRuntime(definition, options);
}

export function graphQueryOptionsWithRuntime<
    const TDefinition extends AnyGraphqlDefinition,
    TData = GraphQueryData<TDefinition>,
>(
    definition: TDefinition,
    options?: UseGraphQueryOptions<TDefinition, TData>,
    runtime?: GraphQueryRuntimeOptions
): GraphQueryOptionsResult<GraphqlDefinitionRoot<TDefinition>, TData> {
    const context = resolveGraphQueryContext(definition, options, runtime);

    return queryOptions<GraphqlDefinitionRoot<TDefinition>, Error, TData>({
        ...(context.queryOptions as Omit<
            UseGraphQueryOptions<TDefinition, TData>,
            "client" | "initialData" | "requestHeaders" | "select" | "variables"
        >),
        queryKey: getGraphQueryKey(definition, context.variables),
        queryFn: ({ signal }) =>
            requestGraphRootData<TDefinition>(
                context.client,
                context.document,
                context.variables,
                context.requestHeaders,
                signal
            ),
        select: (data) => selectGraphData(data, definition, context.select),
        ...(context.wrappedInitialData && {
            initialData: context.wrappedInitialData,
        }),
    }) as GraphQueryOptionsResult<GraphqlDefinitionRoot<TDefinition>, TData>;
}

export async function graphQuery<const TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>>(
    definition: TDefinition,
    options: GraphQueryOptions<TDefinition, TData>
) {
    const { queryClient, ...queryOptionsInput } = options;
    const context = resolveGraphQueryContext(definition, queryOptionsInput);

    const rootData = await queryClient.fetchQuery<GraphqlDefinitionRoot<TDefinition>>({
        ...(context.queryOptions as Omit<
            GraphQueryOptions<TDefinition, TData>,
            "client" | "initialData" | "queryClient" | "requestHeaders" | "select" | "variables"
        >),
        queryKey: getGraphQueryKey(definition, context.variables),
        queryFn: ({ signal }) =>
            requestGraphRootData<TDefinition>(
                context.client,
                context.document,
                context.variables,
                context.requestHeaders,
                signal
            ),
        ...(context.wrappedInitialData && {
            initialData: context.wrappedInitialData,
        }),
    });

    return selectGraphData(rootData, definition, context.select);
}

export { GRAPH_DEBUG_PARSE_KEY_HEADER };
