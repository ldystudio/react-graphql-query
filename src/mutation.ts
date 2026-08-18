import type { GraphQLClient, RequestOptions } from "graphql-request";
import { getGraphData, setGraphData } from "./cache";
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
    GraphMutationContext,
    GraphMutationOptions,
    GraphMutationOptionsResult,
    GraphMutationVariables,
    GraphQueryData,
    UseGraphMutationOptions,
} from "./types";

type GraphMutationRuntimeContext<TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>> = {
    client: GraphQLClient;
    definition: TDefinition;
    document: GraphqlDefinitionDocument<TDefinition>;
    requestHeaders?: RequestOptions["requestHeaders"];
    select?: (data: GraphQueryData<TDefinition>) => TData;
    variables?: GraphqlDefinitionVariables<TDefinition>;
};

type GraphMutationRuntimeOptions<TDefinition extends AnyGraphqlDefinition> = {
    debugParseKeyHeader?: boolean;
    queryClient: GraphMutationContext<TDefinition>["queryClient"];
};

function resolveGraphMutationContext<
    const TDefinition extends AnyGraphqlDefinition,
    TData = GraphQueryData<TDefinition>,
>(
    definition: TDefinition,
    options?: Pick<GraphMutationOptions<TDefinition, TData>, "client" | "requestHeaders" | "select" | "variables">,
    runtime?: Pick<GraphMutationRuntimeOptions<TDefinition>, "debugParseKeyHeader">
): GraphMutationRuntimeContext<TDefinition, TData> {
    const { client, requestHeaders, select, variables } = options ?? {};

    return {
        client: getGraphClient(definition, { client }),
        definition,
        document: definition.document as GraphqlDefinitionDocument<TDefinition>,
        requestHeaders: withDebugParseKeyHeader(requestHeaders, definition, runtime?.debugParseKeyHeader ?? false),
        select,
        variables: resolveGraphVariables(
            definition.variables as GraphqlDefinitionVariables<TDefinition> | undefined,
            variables as GraphqlDefinitionVariables<TDefinition> | undefined
        ),
    };
}

export function graphMutationOptionsWithRuntime<
    const TDefinition extends AnyGraphqlDefinition,
    TOnMutateResult = unknown,
    TData = GraphQueryData<TDefinition>,
    TQuery extends AnyGraphqlDefinition = TDefinition,
    TQueryData = GraphQueryData<TQuery>,
>(
    definition: TDefinition,
    options:
        | UseGraphMutationOptions<
              TDefinition,
              TOnMutateResult,
              TData,
              GraphMutationVariables<TDefinition>,
              TQuery,
              TQueryData
          >
        | undefined,
    runtime: GraphMutationRuntimeOptions<TDefinition>
): GraphMutationOptionsResult<TDefinition, TOnMutateResult, TData> {
    const {
        client,
        onError,
        onMutate,
        onSettled,
        onSuccess,
        optimisticUpdate,
        requestHeaders,
        select,
        ...mutationOptions
    } = options ?? {};
    const context = resolveGraphMutationContext(definition, { client, requestHeaders, select }, runtime);
    const graphContext: GraphMutationContext<TDefinition> = {
        client: context.client,
        definition,
        queryClient: runtime.queryClient,
    };

    let wrapOnMutate:
        | ((variables: GraphMutationVariables<TDefinition>) => Promise<TOnMutateResult> | TOnMutateResult)
        | undefined;
    let wrapOnError:
        | ((
              error: Error,
              variables: GraphMutationVariables<TDefinition>,
              onMutateResult: TOnMutateResult | undefined
          ) => void)
        | undefined;
    let wrapOnSuccess:
        | ((
              data: TData,
              variables: GraphMutationVariables<TDefinition>,
              onMutateResult: TOnMutateResult | undefined
          ) => void)
        | undefined;

    type OptimisticMutateResult = {
        previous: TQueryData | undefined;
        userResult: TOnMutateResult | undefined;
    };

    let writeCache: ((value: TQueryData) => void) | undefined;
    let invalidateOnSuccess: (() => void) | undefined;

    if (optimisticUpdate != null) {
        const { query, queryVariables, kind = "query", invalidateQueryOnSuccess = false } = optimisticUpdate;
        const queryKey = getGraphQueryKey(query, queryVariables);

        writeCache = (value: TQueryData) => {
            if (kind === "infinite") {
                runtime.queryClient.setQueryData(queryKey, value);
            } else {
                setGraphData(runtime.queryClient, query, queryVariables, value as GraphQueryData<TQuery>);
            }
        };

        if (invalidateQueryOnSuccess) {
            invalidateOnSuccess = () => {
                void runtime.queryClient.invalidateQueries({ queryKey });
            };
        }
    }

    if (onMutate != null || optimisticUpdate != null) {
        wrapOnMutate = async (variables: GraphMutationVariables<TDefinition>) => {
            let previous: TQueryData | undefined;

            if (optimisticUpdate != null) {
                const { query, queryVariables, kind = "query", getOptimisticState } = optimisticUpdate;
                const queryKey = getGraphQueryKey(query, queryVariables);

                await runtime.queryClient.cancelQueries({ queryKey });

                previous =
                    kind === "infinite"
                        ? runtime.queryClient.getQueryData<TQueryData>(queryKey)
                        : (getGraphData(runtime.queryClient, query, queryVariables) as TQueryData);

                const next = getOptimisticState({ currentData: previous, variables });

                if (next !== undefined) {
                    writeCache?.(next);
                }
            }

            const userResult = onMutate ? await onMutate(variables, graphContext) : undefined;

            return optimisticUpdate != null
                ? ({ previous, userResult } as TOnMutateResult)
                : (userResult as TOnMutateResult);
        };
    }

    if (onError != null || optimisticUpdate != null) {
        wrapOnError = (error, variables, onMutateResult) => {
            if (optimisticUpdate != null) {
                const optimistic = onMutateResult as OptimisticMutateResult | undefined;

                if (optimistic?.previous !== undefined) {
                    writeCache?.(optimistic.previous);
                }

                if (onError != null) {
                    void onError(error, variables, optimistic?.userResult, graphContext);
                }
            } else if (onError != null) {
                void onError(error, variables, onMutateResult, graphContext);
            }
        };
    }

    if (onSuccess != null || optimisticUpdate != null) {
        wrapOnSuccess = (data, variables, onMutateResult) => {
            invalidateOnSuccess?.();

            if (onSuccess != null) {
                void onSuccess(
                    data,
                    variables,
                    optimisticUpdate != null
                        ? (onMutateResult as OptimisticMutateResult | undefined)?.userResult
                        : onMutateResult,
                    graphContext
                );
            }
        };
    }

    return {
        ...mutationOptions,
        mutationKey: mutationOptions.mutationKey ?? getGraphQueryKey(definition),
        mutationFn: async (variables: GraphMutationVariables<TDefinition>) => {
            const rootData = await requestGraphRootData<TDefinition>(
                context.client,
                context.document,
                resolveGraphVariables(
                    context.variables,
                    variables as GraphqlDefinitionVariables<TDefinition> | undefined
                ),
                context.requestHeaders
            );

            return selectGraphData(rootData, definition, context.select);
        },
        onError: wrapOnError,
        onMutate: wrapOnMutate,
        onSettled:
            onSettled == null
                ? undefined
                : (
                      data: TData | undefined,
                      error: Error | null,
                      variables: GraphMutationVariables<TDefinition>,
                      onMutateResult: TOnMutateResult | undefined
                  ) => onSettled(data, error, variables, onMutateResult, graphContext),
        onSuccess: wrapOnSuccess,
    };
}

export async function graphMutation<
    const TDefinition extends AnyGraphqlDefinition,
    TData = GraphQueryData<TDefinition>,
>(definition: TDefinition, options?: GraphMutationOptions<TDefinition, TData>) {
    const context = resolveGraphMutationContext(definition, options);
    const rootData = await requestGraphRootData<TDefinition>(
        context.client,
        context.document,
        context.variables,
        context.requestHeaders
    );

    return selectGraphData(rootData, definition, context.select);
}
