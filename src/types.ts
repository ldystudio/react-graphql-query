import type { QueryClient, QueryFunction, QueryKey, UseQueryOptions } from "@tanstack/react-query";
import type { GraphQLClient, RequestOptions } from "graphql-request";
import type { GraphqlDefinition, GraphqlDefinitionParseKey, GraphqlDefinitionRoot } from "./definition";

export type GraphParseKey<Path extends string> = Path extends `${infer Head}.${infer Tail}`
    ? [Head, ...GraphParseKey<Tail>]
    : [Path];

export type GraphValueAtPath<T, Path extends readonly string[]> = Path extends [
    infer Head extends keyof T & string,
    ...infer Tail extends string[],
]
    ? GraphValueAtPath<T[Head], Tail>
    : Path extends []
      ? T
      : never;

type GraphSchema<T> = keyof T & string;
type GraphKey<T> = keyof T[GraphSchema<T>] & string;
type GraphValue<T> = T[GraphSchema<T>][GraphKey<T>];

export type GraphValueByParseKey<T, ParseKey extends string> = string extends ParseKey
    ? GraphValue<T>
    : GraphValueAtPath<T, GraphParseKey<ParseKey>>;

export type AnyGraphqlDefinition = GraphqlDefinition<unknown>;

export type GraphQueryData<TDefinition extends AnyGraphqlDefinition> = GraphValueByParseKey<
    GraphqlDefinitionRoot<TDefinition>,
    GraphqlDefinitionParseKey<TDefinition>
>;

type GraphRequestOptions = Pick<RequestOptions, "requestHeaders" | "variables">;

type GraphQueryBaseOptions<TQueryFnData, TData> = Omit<
    UseQueryOptions<TQueryFnData, Error, TData>,
    "initialData" | "queryKey" | "queryFn" | "select"
>;

export type UseGraphQueryOptions<
    TDefinition extends AnyGraphqlDefinition,
    TData = GraphQueryData<TDefinition>,
> = GraphQueryBaseOptions<GraphqlDefinitionRoot<TDefinition>, TData> &
    GraphRequestOptions & {
        client?: GraphQLClient;
        initialData?: GraphQueryData<TDefinition>;
        select?: (data: GraphQueryData<TDefinition>) => TData;
    };

export type GraphQueryOptions<
    TDefinition extends AnyGraphqlDefinition,
    TData = GraphQueryData<TDefinition>,
> = UseGraphQueryOptions<TDefinition, TData> & {
    queryClient: QueryClient;
};

export type GraphQueryOptionsResult<TQueryFnData, TData = TQueryFnData> = Omit<
    UseQueryOptions<TQueryFnData, Error, TData, QueryKey>,
    "queryKey" | "queryFn"
> & {
    queryKey: QueryKey;
    queryFn: QueryFunction<TQueryFnData, QueryKey>;
};
