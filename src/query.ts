import { queryOptions } from "@tanstack/react-query";
import type { GraphQLClient, RequestOptions } from "graphql-request";
import type { GraphqlDefinitionRoot } from "./definition";
import { createInitialDataByParseKey, getGraphQueryKey, getValueByParseKey } from "./key";
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

export const GRAPH_DEBUG_PARSE_KEY_HEADER = "x-graph-parse-key";

type GraphQueryContext<TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>> = {
    client: GraphQLClient;
    document: RequestOptions["document"];
    parseKey: string;
    variables?: RequestOptions["variables"];
    requestHeaders?: RequestOptions["requestHeaders"];
    select?: (data: GraphQueryData<TDefinition>) => TData;
    wrappedInitialData?: GraphqlDefinitionRoot<TDefinition>;
    queryOptions: Record<string, unknown>;
};

function selectGraphData<const TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>>(
    rootData: GraphqlDefinitionRoot<TDefinition>,
    definition: TDefinition,
    select?: (parsedData: GraphQueryData<TDefinition>) => TData
) {
    const shadow = getValueByParseKey(rootData, definition) as GraphQueryData<TDefinition>;

    return select ? select(shadow) : (shadow as TData);
}

function getGraphClient<const TDefinition extends AnyGraphqlDefinition>(
    definition: TDefinition,
    options?: { client?: GraphQLClient }
) {
    const client = definition.client ?? options?.client;

    if (!client) {
        throw new Error("GraphQL client is required. Pass it via definition.client or options.client.");
    }

    return client;
}

function withDebugParseKeyHeader(requestHeaders: RequestOptions["requestHeaders"], parseKey: string, enabled: boolean) {
    if (!enabled) {
        return requestHeaders;
    }

    return {
        ...requestHeaders,
        [GRAPH_DEBUG_PARSE_KEY_HEADER]: parseKey,
    };
}

function resolveGraphQueryContext<const TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>>(
    definition: TDefinition,
    options?: UseGraphQueryOptions<TDefinition, TData>,
    runtime?: GraphQueryRuntimeOptions
): GraphQueryContext<TDefinition, TData> {
    const runtimeDefinition = definition as GraphqlRuntimeDefinition;
    const {
        __rootType: _rootType,
        client: _definitionClient,
        document,
        parseKey,
        variables: definitionVariables,
        ...definitionQueryOptions
    } = runtimeDefinition;
    const {
        client,
        initialData,
        requestHeaders,
        select,
        variables = definitionVariables,
        ...runtimeOptions
    } = options ?? {};

    return {
        client: getGraphClient(definition, { client }),
        document,
        parseKey,
        variables,
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
        queryFn: async () =>
            context.client.request<GraphqlDefinitionRoot<TDefinition>>(
                context.document,
                context.variables,
                context.requestHeaders
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
        queryFn: async () =>
            context.client.request<GraphqlDefinitionRoot<TDefinition>>(
                context.document,
                context.variables,
                context.requestHeaders
            ),
        ...(context.wrappedInitialData && {
            initialData: context.wrappedInitialData,
        }),
    });

    return selectGraphData(rootData, definition, context.select);
}
