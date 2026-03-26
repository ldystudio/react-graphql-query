import type { GraphQLClient, RequestOptions } from "graphql-request";
import { inferGraphParseKey } from "./infer";

export interface GraphqlDefinitionInput<ParseKey extends string = string> {
    client?: GraphQLClient;
    parseKey?: ParseKey;
    document: RequestOptions["document"];
    variables?: RequestOptions["variables"];
}

type GraphqlSelectionValue<T> = T extends readonly (infer Item)[]
    ? GraphqlSelectionValue<Item>
    : Exclude<T, null | undefined>;

type GraphqlNonNullableValue<T> = Exclude<T, null | undefined>;
type GraphqlObjectValue<T> = Extract<GraphqlSelectionValue<T>, object>;
type GraphqlArrayElementValue<T> =
    GraphqlNonNullableValue<T> extends readonly (infer Item)[] ? GraphqlSelectionValue<Item> : never;

type GraphqlSingleKey<T extends object, Key extends keyof T & string = keyof T & string> = Key extends Key
    ? Exclude<keyof T & string, Key> extends never
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

type GraphqlDefinitionResolvedParseKey<TRoot, TDefinition extends GraphqlDefinitionInput> = TDefinition extends {
    parseKey: infer ParseKey extends string;
}
    ? ParseKey
    : GraphqlInferredParseKey<TRoot>;

export type GraphqlDefinition<TRoot, ParseKey extends string = string> = Omit<
    GraphqlDefinitionInput<ParseKey>,
    "parseKey"
> & {
    readonly __rootType: TRoot;
    readonly parseKey: ParseKey;
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
    ): GraphqlDefinition<TRoot, GraphqlDefinitionResolvedParseKey<TRoot, TDefinition>> =>
        ({
            ...definition,
            parseKey: definition.parseKey ?? inferGraphParseKey(definition.document),
            __rootType: undefined as TRoot,
        }) as unknown as GraphqlDefinition<TRoot, GraphqlDefinitionResolvedParseKey<TRoot, TDefinition>>;
}
