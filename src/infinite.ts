import type { QueryKey } from "@tanstack/react-query";
import { infiniteQueryOptions } from "@tanstack/react-query";
import type { GraphQLClient, RequestOptions } from "graphql-request";
import type { GraphqlDefinitionDocument, GraphqlDefinitionVariables } from "./definition";
import { getGraphQueryKey } from "./key";
import {
    getGraphClient,
    requestGraphRootData,
    resolveGraphVariables,
    selectGraphData,
    withDebugParseKeyHeader,
} from "./runtime";
import type {
    AnyGraphqlDefinition,
    GraphInfiniteQueryOptionsResult,
    GraphQueryData,
    UseInfiniteGraphQueryOptions,
} from "./types";

type GraphInfiniteQueryRuntimeOptions = {
    debugParseKeyHeader?: boolean;
};

type GraphInfiniteQueryContext<TDefinition extends AnyGraphqlDefinition, TPageParam, TData> = {
    client: GraphQLClient;
    definition: TDefinition;
    document: GraphqlDefinitionDocument<TDefinition>;
    getNextPageParam: UseInfiniteGraphQueryOptions<TDefinition, TPageParam, TData>["getNextPageParam"];
    getPreviousPageParam?: UseInfiniteGraphQueryOptions<TDefinition, TPageParam, TData>["getPreviousPageParam"];
    initialData?: UseInfiniteGraphQueryOptions<TDefinition, TPageParam, TData>["initialData"];
    initialPageParam: TPageParam;
    pageParamToVariables: (
        pageParam: TPageParam,
        variables: GraphqlDefinitionVariables<TDefinition> | undefined
    ) => GraphqlDefinitionVariables<TDefinition>;
    queryOptions: Record<string, unknown>;
    requestHeaders?: RequestOptions["requestHeaders"];
    select?: UseInfiniteGraphQueryOptions<TDefinition, TPageParam, TData>["select"];
    variables?: GraphqlDefinitionVariables<TDefinition>;
};

function resolveGraphInfiniteQueryContext<const TDefinition extends AnyGraphqlDefinition, TPageParam, TData>(
    definition: TDefinition,
    options: UseInfiniteGraphQueryOptions<TDefinition, TPageParam, TData>,
    runtime?: GraphInfiniteQueryRuntimeOptions
): GraphInfiniteQueryContext<TDefinition, TPageParam, TData> {
    const {
        client,
        getNextPageParam,
        getPreviousPageParam,
        initialData,
        initialPageParam,
        pageParamToVariables,
        requestHeaders,
        select,
        variables,
        ...queryOptions
    } = options;

    return {
        client: getGraphClient(definition, { client }),
        definition,
        document: definition.document as GraphqlDefinitionDocument<TDefinition>,
        getNextPageParam,
        getPreviousPageParam,
        initialData,
        initialPageParam,
        pageParamToVariables,
        queryOptions,
        requestHeaders: withDebugParseKeyHeader(
            requestHeaders,
            definition.parseKey,
            runtime?.debugParseKeyHeader ?? false
        ),
        select,
        variables: resolveGraphVariables(
            definition.variables as GraphqlDefinitionVariables<TDefinition> | undefined,
            variables
        ),
    };
}

export function graphInfiniteQueryOptions<const TDefinition extends AnyGraphqlDefinition, TPageParam, TData>(
    definition: TDefinition,
    options: UseInfiniteGraphQueryOptions<TDefinition, TPageParam, TData>
): GraphInfiniteQueryOptionsResult<GraphQueryData<TDefinition>, TData, TPageParam> {
    return graphInfiniteQueryOptionsWithRuntime(definition, options);
}

export function graphInfiniteQueryOptionsWithRuntime<const TDefinition extends AnyGraphqlDefinition, TPageParam, TData>(
    definition: TDefinition,
    options: UseInfiniteGraphQueryOptions<TDefinition, TPageParam, TData>,
    runtime?: GraphInfiniteQueryRuntimeOptions
): GraphInfiniteQueryOptionsResult<GraphQueryData<TDefinition>, TData, TPageParam> {
    const context = resolveGraphInfiniteQueryContext(definition, options, runtime);

    return infiniteQueryOptions<GraphQueryData<TDefinition>, Error, TData, QueryKey, TPageParam>({
        ...(context.queryOptions as Omit<
            UseInfiniteGraphQueryOptions<TDefinition, TPageParam, TData>,
            | "client"
            | "initialData"
            | "initialPageParam"
            | "pageParamToVariables"
            | "requestHeaders"
            | "select"
            | "variables"
        >),
        queryKey: getGraphQueryKey(definition, context.variables),
        queryFn: ({ pageParam, signal }) =>
            requestGraphRootData<TDefinition>(
                context.client,
                context.document,
                context.pageParamToVariables(pageParam as TPageParam, context.variables),
                context.requestHeaders,
                signal
            ).then((data) => selectGraphData(data, definition)),
        ...(context.initialData !== undefined && {
            initialData: context.initialData,
        }),
        getNextPageParam: context.getNextPageParam,
        ...(context.getPreviousPageParam != null && {
            getPreviousPageParam: context.getPreviousPageParam,
        }),
        initialPageParam: context.initialPageParam,
        select: context.select,
    }) as GraphInfiniteQueryOptionsResult<GraphQueryData<TDefinition>, TData, TPageParam>;
}
