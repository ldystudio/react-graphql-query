import type { GraphQLClient } from "graphql-request";
import { createContext, useContext } from "react";

export const GraphqlClientContext = createContext<GraphQLClient | undefined>(undefined);

export function useGraphqlClient() {
    return useContext(GraphqlClientContext);
}
