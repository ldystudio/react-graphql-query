import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useGraphqlClient } from "./context";
import { graphQueryOptions } from "./query";
import type { AnyGraphqlDefinition, GraphQueryData, UseGraphQueryOptions } from "./types";

function withContextClient<const TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>>(
    definition: TDefinition,
    options: UseGraphQueryOptions<TDefinition, TData> | undefined,
    contextClient: ReturnType<typeof useGraphqlClient>
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
    const contextClient = useGraphqlClient();

    return useQuery(graphQueryOptions(definition, withContextClient(definition, options, contextClient)));
}
