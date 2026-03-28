import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import type { GraphQLClient } from "graphql-request";
import type { PropsWithChildren } from "react";
import { GraphqlClientContext } from "./context";

export interface GraphqlClientProviderProps extends PropsWithChildren {
    client: GraphQLClient;
    debugParseKeyHeader?: boolean;
}

export interface GraphqlQueryProviderProps extends GraphqlClientProviderProps {
    queryClient: QueryClient;
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

export function GraphqlQueryProvider({
    client,
    children,
    debugParseKeyHeader = false,
    queryClient,
}: GraphqlQueryProviderProps) {
    return (
        <QueryClientProvider client={queryClient}>
            <GraphqlClientProvider client={client} debugParseKeyHeader={debugParseKeyHeader}>
                {children}
            </GraphqlClientProvider>
        </QueryClientProvider>
    );
}
