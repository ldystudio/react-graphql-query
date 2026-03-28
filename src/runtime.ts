import type { GraphQLClient, RequestOptions } from "graphql-request";
import type { GraphqlDefinitionDocument, GraphqlDefinitionRoot, GraphqlDefinitionVariables } from "./definition";
import { getValueByParseKey } from "./key";
import type { AnyGraphqlDefinition, GraphQueryData } from "./types";

export const GRAPH_DEBUG_PARSE_KEY_HEADER = "x-graph-parse-key";

export function selectGraphData<const TDefinition extends AnyGraphqlDefinition, TData = GraphQueryData<TDefinition>>(
    rootData: GraphqlDefinitionRoot<TDefinition>,
    definition: TDefinition,
    select?: (parsedData: GraphQueryData<TDefinition>) => TData
) {
    const shadow = getValueByParseKey(rootData, definition) as GraphQueryData<TDefinition>;

    return select ? select(shadow) : (shadow as TData);
}

export function getGraphClient<const TDefinition extends AnyGraphqlDefinition>(
    definition: TDefinition,
    options?: { client?: GraphQLClient }
) {
    const client = definition.client ?? options?.client;

    if (!client) {
        throw new Error("GraphQL client is required. Pass it via definition.client or options.client.");
    }

    return client;
}

export function withDebugParseKeyHeader(
    requestHeaders: RequestOptions["requestHeaders"],
    parseKey: string,
    enabled: boolean
) {
    if (!enabled) {
        return requestHeaders;
    }

    return {
        ...requestHeaders,
        [GRAPH_DEBUG_PARSE_KEY_HEADER]: parseKey,
    };
}

export function resolveGraphVariables<const TDefinition extends AnyGraphqlDefinition>(
    definitionVariables: GraphqlDefinitionVariables<TDefinition> | undefined,
    variables: GraphqlDefinitionVariables<TDefinition> | undefined
) {
    return variables === undefined ? definitionVariables : variables;
}

export async function requestGraphRootData<const TDefinition extends AnyGraphqlDefinition>(
    client: GraphQLClient,
    document: GraphqlDefinitionDocument<TDefinition>,
    variables: GraphqlDefinitionVariables<TDefinition> | undefined,
    requestHeaders?: RequestOptions["requestHeaders"],
    signal?: RequestInit["signal"]
) {
    if (variables === undefined) {
        return client.request<GraphqlDefinitionRoot<TDefinition>, GraphqlDefinitionVariables<TDefinition>>({
            document: document as RequestOptions["document"],
            ...(requestHeaders !== undefined && { requestHeaders }),
            ...(signal !== undefined && { signal }),
        } as RequestOptions<GraphqlDefinitionVariables<TDefinition>, GraphqlDefinitionRoot<TDefinition>>);
    }

    return client.request<GraphqlDefinitionRoot<TDefinition>, GraphqlDefinitionVariables<TDefinition>>({
        document: document as RequestOptions["document"],
        requestHeaders,
        signal,
        variables,
    } as unknown as RequestOptions<GraphqlDefinitionVariables<TDefinition>, GraphqlDefinitionRoot<TDefinition>>);
}
