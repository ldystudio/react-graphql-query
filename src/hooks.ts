import type { UseInfiniteQueryResult, UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGraphqlClientContext } from "./context";
import { graphInfiniteQueryOptionsWithRuntime } from "./infinite";
import { graphMutationOptionsWithRuntime } from "./mutation";
import { graphQueryOptionsWithRuntime } from "./query";
import type {
    AnyGraphqlDefinition,
    GraphInfiniteData,
    GraphMutationVariables,
    GraphQueryData,
    UseGraphMutationOptions,
    UseGraphQueryOptions,
    UseInfiniteGraphQueryOptions,
} from "./types";

function withContextClient<TOptions extends { client?: ReturnType<typeof useGraphqlClientContext>["client"] }>(
    definition: AnyGraphqlDefinition,
    options: TOptions | undefined,
    contextClient: ReturnType<typeof useGraphqlClientContext>["client"]
) {
    if (definition.client || options?.client || !contextClient) {
        return options;
    }

    return {
        ...options,
        client: contextClient,
    } as TOptions;
}

export function useGraphQuery<const TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>>(
    definition: TDefinition,
    options?: UseGraphQueryOptions<TDefinition, TData>
): UseQueryResult<TData, Error> {
    const context = useGraphqlClientContext();

    return useQuery(
        graphQueryOptionsWithRuntime(definition, withContextClient(definition, options, context.client), {
            debugParseKeyHeader: context.debugParseKeyHeader,
        })
    );
}

export function useInfiniteGraphQuery<
    const TDefinition extends AnyGraphqlDefinition,
    TPageParam,
    TData = GraphInfiniteData<TDefinition, TPageParam>,
>(
    definition: TDefinition,
    options: UseInfiniteGraphQueryOptions<TDefinition, TPageParam, TData>
): UseInfiniteQueryResult<TData, Error> {
    const context = useGraphqlClientContext();

    return useInfiniteQuery(
        graphInfiniteQueryOptionsWithRuntime(
            definition,
            withContextClient(definition, options, context.client) as UseInfiniteGraphQueryOptions<
                TDefinition,
                TPageParam,
                TData
            >,
            {
                debugParseKeyHeader: context.debugParseKeyHeader,
            }
        )
    );
}

export function useGraphMutation<
    const TDefinition extends AnyGraphqlDefinition,
    TOnMutateResult = unknown,
    TData = GraphQueryData<TDefinition>,
    TQuery extends AnyGraphqlDefinition = TDefinition,
    TQueryData = GraphQueryData<TQuery>,
>(
    definition: TDefinition,
    options?: UseGraphMutationOptions<
        TDefinition,
        TOnMutateResult,
        TData,
        GraphMutationVariables<TDefinition>,
        TQuery,
        TQueryData
    >
): UseMutationResult<TData, Error, GraphMutationVariables<TDefinition>, TOnMutateResult> {
    const context = useGraphqlClientContext();
    const queryClient = useQueryClient();

    return useMutation(
        graphMutationOptionsWithRuntime<TDefinition, TOnMutateResult, TData, TQuery, TQueryData>(
            definition,
            withContextClient(definition, options, context.client) as UseGraphMutationOptions<
                TDefinition,
                TOnMutateResult,
                TData,
                GraphMutationVariables<TDefinition>,
                TQuery,
                TQueryData
            >,
            {
                debugParseKeyHeader: context.debugParseKeyHeader,
                queryClient,
            }
        ),
        queryClient
    );
}
