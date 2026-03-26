import type { GraphQLClient } from "graphql-request";
import { createContext, useContext } from "react";

export type GraphqlClientContextValue = {
    client?: GraphQLClient;
    debugParseKeyHeader: boolean;
};

export const GraphqlClientContext = createContext<GraphqlClientContextValue | undefined>(undefined);

export function useGraphqlClient() {
    return useContext(GraphqlClientContext)?.client;
}

export function useGraphqlClientContext() {
    return (
        useContext(GraphqlClientContext) ?? {
            debugParseKeyHeader: false,
        }
    );
}
