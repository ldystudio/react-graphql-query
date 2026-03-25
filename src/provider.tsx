import type { GraphQLClient } from "graphql-request";
import type { PropsWithChildren } from "react";
import { GraphqlClientContext } from "./context";

export interface GraphqlClientProviderProps extends PropsWithChildren {
    client: GraphQLClient;
}

export function GraphqlClientProvider({ client, children }: GraphqlClientProviderProps) {
    return <GraphqlClientContext.Provider value={client}>{children}</GraphqlClientContext.Provider>;
}
