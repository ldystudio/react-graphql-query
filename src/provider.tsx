import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import type { GraphQLClient } from "graphql-request";
import type { PropsWithChildren } from "react";
import { GraphqlClientContext } from "./context";
import type { GraphqlSubscriptionClient } from "./subscription";

export interface GraphqlClientProviderProps extends PropsWithChildren {
    client: GraphQLClient;
    subscriptionClient?: GraphqlSubscriptionClient;
    debugParseKeyHeader?: boolean;
}

export interface GraphqlQueryProviderProps extends GraphqlClientProviderProps {
    queryClient: QueryClient;
}

export function GraphqlClientProvider({
    client,
    children,
    subscriptionClient,
    debugParseKeyHeader = false,
}: GraphqlClientProviderProps) {
    return (
        <GraphqlClientContext.Provider
            value={{
                client,
                subscriptionClient,
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
    subscriptionClient,
}: GraphqlQueryProviderProps) {
    return (
        <QueryClientProvider client={queryClient}>
            <GraphqlClientProvider
                client={client}
                subscriptionClient={subscriptionClient}
                debugParseKeyHeader={debugParseKeyHeader}
            >
                {children}
            </GraphqlClientProvider>
        </QueryClientProvider>
    );
}
