import { hashKey, useQueryClient } from "@tanstack/react-query";
import { print } from "graphql";
import { type Client, type ClientOptions, createClient } from "graphql-ws";
import { useEffect, useRef, useState } from "react";
import { setGraphData } from "./cache";
import { useGraphqlClientContext } from "./context";
import type { GraphqlDefinitionRoot, GraphqlDefinitionVariables } from "./definition";
import { getValueByParseKey } from "./key";
import { resolveGraphVariables } from "./runtime";
import type { AnyGraphqlDefinition, GraphQueryData } from "./types";

export type GraphSubscriptionStatus = "idle" | "connecting" | "connected" | "complete" | "error";

export type GraphqlSubscriptionClient = Client & {
    getConnectionStatus: () => "idle" | "connecting" | "connected";
};

export function createGraphqlSubscriptionClient(options: Omit<ClientOptions, "lazy" | "retryAttempts">) {
    let status: ReturnType<GraphqlSubscriptionClient["getConnectionStatus"]> = "idle";
    const client = createClient({
        shouldRetry: () => true,
        retryWait: (retries) =>
            new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** retries, 30_000) + Math.random() * 1000)),
        ...options,
        lazy: true,
        retryAttempts: Infinity,
    });

    client.on("connecting", () => {
        status = "connecting";
    });
    client.on("connected", () => {
        status = "connected";
    });
    client.on("closed", () => {
        status = "idle";
    });

    return Object.assign(client, { getConnectionStatus: () => status });
}

export type GraphSubscriptionCacheOptions<
    TDefinition extends AnyGraphqlDefinition,
    TQuery extends AnyGraphqlDefinition,
> = {
    query: TQuery;
    queryVariables?: GraphqlDefinitionVariables<TQuery>;
    update: (
        currentData: GraphQueryData<TQuery> | undefined,
        data: GraphQueryData<TDefinition>
    ) => GraphQueryData<TQuery> | undefined;
};

export type UseGraphSubscriptionOptions<
    TDefinition extends AnyGraphqlDefinition,
    TQuery extends AnyGraphqlDefinition = TDefinition,
> = {
    client?: GraphqlSubscriptionClient;
    variables?: GraphqlDefinitionVariables<TDefinition>;
    enabled?: boolean;
    onData?: (data: GraphQueryData<TDefinition>) => void;
    cache?: GraphSubscriptionCacheOptions<TDefinition, TQuery>;
};

export type UseGraphSubscriptionResult = { status: GraphSubscriptionStatus; error: Error | null };

function subscriptionError(error: unknown): Error {
    if (error instanceof Error) return error;
    if (Array.isArray(error)) {
        return new Error(error.map((item) => item?.message ?? String(item)).join("; "));
    }
    if (typeof error === "object" && error !== null && "code" in error) {
        const close = error as { code: unknown; reason?: unknown };
        return new Error(`WebSocket closed (${close.code}): ${close.reason ?? ""}`);
    }
    return new Error(String(error));
}

export function useGraphSubscription<
    const TDefinition extends AnyGraphqlDefinition,
    const TQuery extends AnyGraphqlDefinition = TDefinition,
>(definition: TDefinition, options?: UseGraphSubscriptionOptions<TDefinition, TQuery>): UseGraphSubscriptionResult {
    const context = useGraphqlClientContext();
    const queryClient = useQueryClient();
    const client = options?.client ?? context.subscriptionClient;
    const enabled = options?.enabled ?? true;
    const { document, kind, parseKey } = definition;
    const variables = resolveGraphVariables<TDefinition>(
        definition.variables as GraphqlDefinitionVariables<TDefinition> | undefined,
        options?.variables
    );
    const variablesKey = hashKey([variables]);
    const optionsRef = useRef(options);
    const [result, setResult] = useState<UseGraphSubscriptionResult>({ status: "idle", error: null });

    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    useEffect(() => {
        if (!enabled) {
            setResult({ status: "idle", error: null });
            return;
        }
        if (!client || kind !== "Subscription") {
            setResult({
                status: "error",
                error: new Error(
                    !client ? "GraphQL subscription client is required" : "GraphQL subscription is required"
                ),
            });
            return;
        }

        let active = true;
        let finished = false;
        const setStatus = (status: GraphSubscriptionStatus) => {
            if (active && !finished) setResult({ status, error: null });
        };
        const removeListeners = [
            client.on("connecting", () => setStatus("connecting")),
            client.on("connected", () => setStatus("connected")),
            client.on("closed", () => setStatus("connecting")),
        ];
        setStatus(client.getConnectionStatus() === "connected" ? "connected" : "connecting");

        const unsubscribe = client.subscribe<GraphqlDefinitionRoot<TDefinition>>(
            {
                query: typeof document === "string" ? document : print(document),
                variables:
                    (JSON.parse(variablesKey) as [GraphqlDefinitionVariables<TDefinition> | null])[0] ?? undefined,
            },
            {
                next: (value) => {
                    if (!active || finished) return;
                    setResult({
                        status: "connected",
                        error: value.errors?.length ? subscriptionError(value.errors) : null,
                    });
                    if (value.data == null) return;
                    const data = getValueByParseKey(value.data, parseKey) as GraphQueryData<TDefinition>;
                    const cache = optionsRef.current?.cache;
                    if (cache) {
                        setGraphData(queryClient, cache.query, cache.queryVariables, (currentData) =>
                            cache.update(currentData, data)
                        );
                    }
                    optionsRef.current?.onData?.(data);
                },
                error: (error) => {
                    if (!active || finished) return;
                    finished = true;
                    setResult({ status: "error", error: subscriptionError(error) });
                },
                complete: () => {
                    if (!active || finished) return;
                    finished = true;
                    setResult({ status: "complete", error: null });
                },
            }
        );

        return () => {
            active = false;
            for (const remove of removeListeners) remove();
            unsubscribe();
        };
    }, [client, document, kind, parseKey, enabled, queryClient, variablesKey]);

    return result;
}
