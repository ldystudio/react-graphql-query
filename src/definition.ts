import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import type { QueryKey } from "@tanstack/react-query";
import type { GraphQLClient, RequestDocument, Variables } from "graphql-request";
import { inferGraphParseKey } from "./infer";

export type GraphqlVariables = Variables;
export type GraphqlDocument<TData = unknown, TVariables extends GraphqlVariables = GraphqlVariables> =
    | RequestDocument
    | TypedDocumentNode<TData, TVariables>;

interface GraphqlDocumentTypeDecoration<TResult, TVariables extends GraphqlVariables> {
    __apiType?: (variables: TVariables) => TResult;
}

export type GraphqlDocumentRoot<TDocument> =
    TDocument extends GraphqlDocumentTypeDecoration<infer TRoot, infer _TVariables extends GraphqlVariables>
        ? TRoot
        : unknown;
export type GraphqlDocumentVariables<TDocument> =
    TDocument extends GraphqlDocumentTypeDecoration<unknown, infer TVariables extends GraphqlVariables>
        ? TVariables
        : GraphqlVariables;

type GraphqlMetaKey = "__typename";

export interface GraphqlDefinitionInput<
    TDocument extends GraphqlDocument = GraphqlDocument,
    ParseKey extends string = string,
    TKey extends QueryKey | undefined = undefined,
    TVariables extends GraphqlVariables = GraphqlDocumentVariables<TDocument>,
> {
    client?: GraphQLClient;
    key?: TKey;
    parseKey?: ParseKey;
    document: TDocument;
    variables?: TVariables;
}

type GraphqlSelectionValue<T> = T extends readonly (infer Item)[]
    ? GraphqlSelectionValue<Item>
    : Exclude<T, null | undefined>;

type GraphqlNonNullableValue<T> = Exclude<T, null | undefined>;
type GraphqlObjectValue<T> = Extract<GraphqlSelectionValue<T>, object>;
type GraphqlArrayElementValue<T> =
    GraphqlNonNullableValue<T> extends readonly (infer Item)[] ? GraphqlSelectionValue<Item> : never;
type GraphqlObjectKey<T extends object> = Exclude<keyof T & string, GraphqlMetaKey>;

type GraphqlSingleKey<T extends object, Key extends GraphqlObjectKey<T> = GraphqlObjectKey<T>> = Key extends Key
    ? Exclude<GraphqlObjectKey<T>, Key> extends never
        ? Key
        : never
    : never;

type GraphqlHasSingleKey<T extends object> = [GraphqlSingleKey<T>] extends [never] ? false : true;

type GraphqlChildKind<T> =
    GraphqlNonNullableValue<T> extends readonly unknown[]
        ? [GraphqlObjectValue<GraphqlArrayElementValue<T>>] extends [never]
            ? "array-leaf"
            : GraphqlHasSingleKey<GraphqlObjectValue<GraphqlArrayElementValue<T>>> extends true
              ? "opaque-array"
              : "array-leaf"
        : [GraphqlObjectValue<T>] extends [never]
          ? "scalar"
          : "object";

type GraphqlInferParseKeyTail<T> = [GraphqlObjectValue<T>] extends [never]
    ? ""
    : [GraphqlSingleKey<GraphqlObjectValue<T>>] extends [infer Key]
      ? [Key] extends [never]
          ? ""
          : [Key] extends [string]
            ? GraphqlChildKind<GraphqlObjectValue<T>[Key & keyof GraphqlObjectValue<T>]> extends infer Kind
                ? Kind extends "object"
                    ? GraphqlInferParseKeyTail<
                          GraphqlObjectValue<T>[Key & keyof GraphqlObjectValue<T>]
                      > extends infer Tail extends string
                        ? Tail extends ""
                            ? Key
                            : `${Key}.${Tail}`
                        : never
                    : Kind extends "array-leaf"
                      ? Key
                      : ""
                : never
            : ""
      : "";

export type GraphqlInferredParseKey<TRoot> =
    GraphqlInferParseKeyTail<TRoot> extends infer ParseKey extends string
        ? ParseKey extends ""
            ? string
            : ParseKey
        : string;

export type GraphqlDefinition<
    TRoot,
    ParseKey extends string = string,
    TVariables extends GraphqlVariables = GraphqlVariables,
    TKey extends QueryKey | undefined = undefined,
    TDocument extends GraphqlDocument<TRoot, TVariables> = GraphqlDocument<TRoot, TVariables>,
> = Omit<GraphqlDefinitionInput<TDocument, ParseKey, TKey, TVariables>, "parseKey"> & {
    readonly __rootType: TRoot;
    readonly __variablesType: TVariables;
    readonly parseKey: ParseKey;
};

export type GraphqlDefinitionRoot<TDefinition> = TDefinition extends {
    readonly __rootType: infer TRoot;
}
    ? TRoot
    : never;
export type GraphqlDefinitionVariables<TDefinition> = TDefinition extends {
    readonly __variablesType: infer TVariables extends GraphqlVariables;
}
    ? TVariables
    : GraphqlVariables;
export type GraphqlDefinitionDocument<TDefinition> = TDefinition extends {
    document: infer TDocument extends GraphqlDocument;
}
    ? TDocument
    : GraphqlDocument;
export type GraphqlDefinitionParseKey<TDefinition> = TDefinition extends {
    parseKey: infer ParseKey extends string;
}
    ? ParseKey
    : never;
export type GraphqlDefinitionKey<TDefinition> = TDefinition extends {
    key?: infer TKey extends QueryKey | undefined;
}
    ? TKey
    : undefined;

function createGraphqlDefinition<
    TRoot,
    TVariables extends GraphqlVariables,
    const TDefinition extends GraphqlDefinitionInput<GraphqlDocument, string, QueryKey | undefined, GraphqlVariables>,
>(definition: TDefinition) {
    return {
        ...definition,
        parseKey: definition.parseKey ?? inferGraphParseKey(definition.document),
        __rootType: undefined as unknown as TRoot,
        __variablesType: undefined as unknown as TVariables,
    };
}

type DefineGraphqlFactory<TRoot, TVariables extends GraphqlVariables> = <
    const ParseKey extends string | undefined = undefined,
    const TKey extends QueryKey | undefined = undefined,
>(
    definition: {
        client?: GraphQLClient;
        document: GraphqlDocument;
        key?: TKey;
        parseKey?: ParseKey;
        variables?: TVariables;
    } & Record<string, unknown>
) => GraphqlDefinition<TRoot, ParseKey extends string ? ParseKey : GraphqlInferredParseKey<TRoot>, TVariables, TKey>;

type DefineGraphql = {
    <TRoot, TVariables extends GraphqlVariables = GraphqlVariables>(): DefineGraphqlFactory<TRoot, TVariables>;
    <
        TRoot,
        TVariables extends GraphqlVariables,
        const ParseKey extends string | undefined = undefined,
        const TKey extends QueryKey | undefined = undefined,
    >(
        definition: {
            client?: GraphQLClient;
            document: TypedDocumentNode<TRoot, TVariables>;
            key?: TKey;
            parseKey?: ParseKey;
            variables?: TVariables;
        } & Record<string, unknown>
    ): GraphqlDefinition<TRoot, ParseKey extends string ? ParseKey : GraphqlInferredParseKey<TRoot>, TVariables, TKey>;
    <
        const TDocument extends GraphqlDocument,
        const ParseKey extends string | undefined = undefined,
        const TKey extends QueryKey | undefined = undefined,
    >(
        definition: {
            client?: GraphQLClient;
            document: TDocument;
            key?: TKey;
            parseKey?: ParseKey;
            variables?: GraphqlDocumentVariables<TDocument>;
        } & Record<string, unknown>
    ): GraphqlDefinition<
        GraphqlDocumentRoot<TDocument>,
        ParseKey extends string ? ParseKey : GraphqlInferredParseKey<GraphqlDocumentRoot<TDocument>>,
        GraphqlDocumentVariables<TDocument>,
        TKey
    >;
};

const defineGraphqlImpl = (definition?: {
    client?: GraphQLClient;
    document: GraphqlDocument;
    key?: QueryKey;
    parseKey?: string;
    variables?: GraphqlVariables;
}) => {
    if (definition == null) {
        return <
            const TDefinition extends GraphqlDefinitionInput<
                GraphqlDocument,
                string,
                QueryKey | undefined,
                GraphqlVariables
            >,
        >(
            deferredDefinition: TDefinition
        ) => createGraphqlDefinition<unknown, GraphqlVariables, TDefinition>(deferredDefinition);
    }

    return createGraphqlDefinition<unknown, GraphqlVariables, typeof definition>(definition);
};

export const defineGraphql = defineGraphqlImpl as DefineGraphql;
