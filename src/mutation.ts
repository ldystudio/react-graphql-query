import type { GraphQLClient, RequestOptions } from "graphql-request";
import type { GraphqlDefinitionDocument, GraphqlDefinitionVariables } from "./definition";
import { getGraphQueryKey } from "./key";
import { getGraphClient, requestGraphRootData, resolveGraphVariables, selectGraphData } from "./runtime";
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
    queryClient: GraphMutationContext<TDefinition>["queryClient"];
};

function resolveGraphMutationContext<
    const TDefinition extends AnyGraphqlDefinition,
    TData = GraphQueryData<TDefinition>,
>(
    definition: TDefinition,
    options?: Pick<GraphMutationOptions<TDefinition, TData>, "client" | "requestHeaders" | "select" | "variables">
): GraphMutationRuntimeContext<TDefinition, TData> {
    const { client, requestHeaders, select, variables } = options ?? {};

    return {
        client: getGraphClient(definition, { client }),
        definition,
        document: definition.document as GraphqlDefinitionDocument<TDefinition>,
        requestHeaders,
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
>(
    definition: TDefinition,
    options: UseGraphMutationOptions<TDefinition, TOnMutateResult, TData> | undefined,
    runtime: GraphMutationRuntimeOptions<TDefinition>
): GraphMutationOptionsResult<TDefinition, TOnMutateResult, TData> {
    const { client, onError, onMutate, onSettled, onSuccess, requestHeaders, select, ...mutationOptions } =
        options ?? {};
    const context = resolveGraphMutationContext(definition, { client, requestHeaders, select });
    const graphContext: GraphMutationContext<TDefinition> = {
        client: context.client,
        definition,
        queryClient: runtime.queryClient,
    };

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
        onError:
            onError == null
                ? undefined
                : (
                      error: Error,
                      variables: GraphMutationVariables<TDefinition>,
                      onMutateResult: TOnMutateResult | undefined
                  ) => onError(error, variables, onMutateResult, graphContext),
        onMutate:
            onMutate == null
                ? undefined
                : (variables: GraphMutationVariables<TDefinition>) => onMutate(variables, graphContext),
        onSettled:
            onSettled == null
                ? undefined
                : (
                      data: TData | undefined,
                      error: Error | null,
                      variables: GraphMutationVariables<TDefinition>,
                      onMutateResult: TOnMutateResult | undefined
                  ) => onSettled(data, error, variables, onMutateResult, graphContext),
        onSuccess:
            onSuccess == null
                ? undefined
                : (
                      data: TData,
                      variables: GraphMutationVariables<TDefinition>,
                      onMutateResult: TOnMutateResult | undefined
                  ) => onSuccess(data, variables, onMutateResult, graphContext),
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
