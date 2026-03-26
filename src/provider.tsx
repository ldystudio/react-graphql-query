import type { GraphQLClient } from "graphql-request";
import type { PropsWithChildren } from "react";
import { GraphqlClientContext } from "./context";

export interface GraphqlClientProviderProps extends PropsWithChildren {
    client: GraphQLClient;
    debugParseKeyHeader?: boolean;
}

export function GraphqlClientProvider({ client, children, debugParseKeyHeader = false }: GraphqlClientProviderProps) {
    return (
        <GraphqlClientContext.Provider
            value={{
                client,
                debugParseKeyHeader,
            }}
        >
            {children}
        </GraphqlClientContext.Provider>
    );
}
