import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { graphQueryOptions } from "./query";
import type { AnyGraphqlDefinition, GraphQueryData, UseGraphQueryOptions } from "./types";

export function useGraphQuery<const TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>>(
    definition: TDefinition,
    options?: UseGraphQueryOptions<TDefinition, TData>
): UseQueryResult<TData, Error> {
    return useQuery(graphQueryOptions(definition, options));
}
