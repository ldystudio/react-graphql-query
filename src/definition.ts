import type { GraphQLClient, RequestOptions } from "graphql-request";
import { inferGraphParseKey } from "./infer";

export interface GraphqlDefinitionInput<ParseKey extends string = string> {
    client?: GraphQLClient;
    parseKey?: ParseKey;
    document: RequestOptions["document"];
    variables?: RequestOptions["variables"];
}

type GraphqlDefinitionResolvedParseKey<TDefinition extends GraphqlDefinitionInput> = TDefinition extends {
    parseKey: infer ParseKey extends string;
}
    ? ParseKey
    : string;

export type GraphqlDefinition<TRoot, TDefinition extends GraphqlDefinitionInput = GraphqlDefinitionInput> = Omit<
    TDefinition,
    "parseKey"
> & {
    readonly __rootType: TRoot;
    readonly parseKey: GraphqlDefinitionResolvedParseKey<TDefinition>;
};

export type GraphqlDefinitionRoot<TDefinition> = TDefinition extends { readonly __rootType: infer TRoot }
    ? TRoot
    : never;
export type GraphqlDefinitionParseKey<TDefinition> = TDefinition extends { parseKey: infer ParseKey extends string }
    ? ParseKey
    : never;

export function defineGraphql<TRoot>() {
    return <const TDefinition extends GraphqlDefinitionInput>(
        definition: TDefinition
    ): GraphqlDefinition<TRoot, TDefinition> =>
        ({
            ...definition,
            parseKey: definition.parseKey ?? inferGraphParseKey(definition.document),
            __rootType: undefined as TRoot,
        }) as unknown as GraphqlDefinition<TRoot, TDefinition>;
}
