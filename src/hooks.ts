import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useGraphqlClientContext } from "./context";
import { graphQueryOptionsWithRuntime } from "./query";
import type { AnyGraphqlDefinition, GraphQueryData, UseGraphQueryOptions } from "./types";

function withContextClient<const TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>>(
    definition: TDefinition,
    options: UseGraphQueryOptions<TDefinition, TData> | undefined,
    contextClient: ReturnType<typeof useGraphqlClientContext>["client"]
) {
    if (definition.client || options?.client || !contextClient) {
        return options;
    }

    return {
        ...options,
        client: contextClient,
    } satisfies UseGraphQueryOptions<TDefinition, TData>;
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
