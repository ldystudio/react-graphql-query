import type {
    FetchQueryOptions,
    InfiniteData,
    QueryClient,
    QueryFunction,
    QueryKey,
    UseInfiniteQueryOptions,
    UseMutationOptions,
    UseQueryOptions,
} from "@tanstack/react-query";
import type { GraphQLClient, RequestOptions } from "graphql-request";
import type {
    GraphqlDefinition,
    GraphqlDefinitionParseKey,
    GraphqlDefinitionRoot,
    GraphqlDefinitionVariables,
    GraphqlDocument,
    GraphqlDocumentRoot,
    GraphqlVariables,
} from "./definition";

export type { GraphqlClientProviderProps, GraphqlQueryProviderProps } from "./provider";

export type GraphParseKey<Path extends string> = Path extends `${infer Head}.${infer Tail}`
    ? [Head, ...GraphParseKey<Tail>]
    : [Path];

type GraphMetaKey = "__typename";
type GraphValueObject<T> = Extract<NonNullable<T>, object>;
type GraphValueKey<T> = Exclude<keyof GraphValueObject<T> & string, GraphMetaKey>;
type GraphValueResult<T> = T extends readonly (infer Item)[] ? NonNullable<Item>[] : NonNullable<T>;

export type GraphValueAtPath<T, Path extends readonly string[]> = Path extends [
    infer Head extends string,
    ...infer Tail extends string[],
]
    ? Head extends GraphValueKey<T>
        ? GraphValueAtPath<GraphValueObject<T>[Head], Tail>
        : never
    : Path extends []
      ? GraphValueResult<T>
      : never;

type GraphSchema<T> = GraphValueKey<T>;
type GraphSchemaValue<T> = GraphValueObject<T>[GraphSchema<T>];
type GraphKey<T> = Exclude<keyof GraphValueObject<GraphSchemaValue<T>> & string, GraphMetaKey>;
type GraphValue<T> = GraphValueResult<GraphValueObject<GraphSchemaValue<T>>[GraphKey<T>]>;

export type GraphValueByParseKey<T, ParseKey extends string> = string extends ParseKey
    ? GraphValue<T>
    : GraphValueAtPath<T, GraphParseKey<ParseKey>>;

export type AnyGraphqlDefinition = GraphqlDefinition<unknown, string, GraphqlVariables, QueryKey | undefined>;

export type GraphQueryData<TDefinition extends AnyGraphqlDefinition> = GraphValueByParseKey<
    GraphqlDefinitionRoot<TDefinition>,
    GraphqlDefinitionParseKey<TDefinition>
>;

export type GraphDataItem<TData> = TData extends readonly (infer Item)[] ? Item : never;

export type GraphQueryItem<TDefinition extends AnyGraphqlDefinition> = GraphDataItem<GraphQueryData<TDefinition>>;

export type GraphDocumentData<TDocument extends GraphqlDocument, ParseKey extends string> = GraphValueByParseKey<
    GraphqlDocumentRoot<TDocument>,
    ParseKey
>;

export type GraphDocumentItem<TDocument extends GraphqlDocument, ParseKey extends string> = GraphDataItem<
    GraphDocumentData<TDocument, ParseKey>
>;

export type GraphQueryDataUpdater<TData> = TData | ((currentData: TData | undefined) => TData | undefined);

type GraphRequestOptions<TDefinition extends AnyGraphqlDefinition> = {
    requestHeaders?: RequestOptions["requestHeaders"];
    variables?: GraphqlDefinitionVariables<TDefinition>;
};

type GraphMutationVariablesShape<TVariables> = keyof TVariables extends never ? undefined : TVariables;

export type GraphMutationVariables<TDefinition extends AnyGraphqlDefinition> = GraphMutationVariablesShape<
    GraphqlDefinitionVariables<TDefinition>
>;

export type GraphInfiniteData<TDefinition extends AnyGraphqlDefinition, TPageParam> = InfiniteData<
    GraphQueryData<TDefinition>,
    TPageParam
>;

type GraphQueryHookBaseOptions<TQueryFnData, TData> = Omit<
    UseQueryOptions<TQueryFnData, Error, TData>,
    "initialData" | "queryKey" | "queryFn" | "select"
>;

type GraphQueryFetchBaseOptions<TQueryFnData> = Omit<
    FetchQueryOptions<TQueryFnData, Error, TQueryFnData>,
    "initialData" | "queryKey" | "queryFn"
>;

type GraphInfiniteQueryHookBaseOptions<TQueryFnData, TData, TPageParam> = Omit<
    UseInfiniteQueryOptions<TQueryFnData, Error, TData, QueryKey, TPageParam>,
    "initialData" | "initialPageParam" | "queryKey" | "queryFn" | "select"
>;

type GraphMutationHookBaseOptions<TData, TVariables, TOnMutateResult> = Omit<
    UseMutationOptions<TData, Error, TVariables, TOnMutateResult>,
    "mutationFn" | "onError" | "onMutate" | "onSettled" | "onSuccess"
>;

export type GraphMutationContext<TDefinition extends AnyGraphqlDefinition> = {
    client: GraphQLClient;
    definition: TDefinition;
    queryClient: QueryClient;
};

export type UseGraphQueryOptions<
    TDefinition extends AnyGraphqlDefinition,
    TData = GraphQueryData<TDefinition>,
> = GraphQueryHookBaseOptions<GraphqlDefinitionRoot<TDefinition>, TData> &
    GraphRequestOptions<TDefinition> & {
        client?: GraphQLClient;
        initialData?: GraphQueryData<TDefinition>;
        select?: (data: GraphQueryData<TDefinition>) => TData;
    };

export type GraphQueryOptions<
    TDefinition extends AnyGraphqlDefinition,
    TData = GraphQueryData<TDefinition>,
> = GraphQueryFetchBaseOptions<GraphqlDefinitionRoot<TDefinition>> &
    GraphRequestOptions<TDefinition> & {
        client?: GraphQLClient;
        initialData?: GraphQueryData<TDefinition>;
        queryClient: QueryClient;
        select?: (data: GraphQueryData<TDefinition>) => TData;
    };

export type UseInfiniteGraphQueryOptions<
    TDefinition extends AnyGraphqlDefinition,
    TPageParam,
    TData = GraphInfiniteData<TDefinition, TPageParam>,
> = GraphInfiniteQueryHookBaseOptions<GraphQueryData<TDefinition>, TData, TPageParam> &
    GraphRequestOptions<TDefinition> & {
        client?: GraphQLClient;
        getNextPageParam: NonNullable<
            UseInfiniteQueryOptions<GraphQueryData<TDefinition>, Error, TData, QueryKey, TPageParam>["getNextPageParam"]
        >;
        getPreviousPageParam?: UseInfiniteQueryOptions<
            GraphQueryData<TDefinition>,
            Error,
            TData,
            QueryKey,
            TPageParam
        >["getPreviousPageParam"];
        initialData?: GraphInfiniteData<TDefinition, TPageParam>;
        initialPageParam: TPageParam;
        pageParamToVariables: (
            pageParam: TPageParam,
            variables: GraphqlDefinitionVariables<TDefinition> | undefined
        ) => GraphqlDefinitionVariables<TDefinition>;
        select?: (data: GraphInfiniteData<TDefinition, TPageParam>) => TData;
    };

export type GraphInfiniteQueryOptionsResult<TQueryFnData, TData, TPageParam> = Omit<
    UseInfiniteQueryOptions<TQueryFnData, Error, TData, QueryKey, TPageParam>,
    "queryKey" | "queryFn"
> & {
    queryKey: QueryKey;
    queryFn: NonNullable<UseInfiniteQueryOptions<TQueryFnData, Error, TData, QueryKey, TPageParam>["queryFn"]>;
};

export type UseGraphMutationOptions<
    TDefinition extends AnyGraphqlDefinition,
    TOnMutateResult = unknown,
    TData = GraphQueryData<TDefinition>,
    TVariables = GraphMutationVariables<TDefinition>,
> = GraphMutationHookBaseOptions<TData, TVariables, TOnMutateResult> & {
    client?: GraphQLClient;
    onError?: (
        error: Error,
        variables: TVariables,
        onMutateResult: TOnMutateResult | undefined,
        context: GraphMutationContext<TDefinition>
    ) => Promise<unknown> | unknown;
    onMutate?: (
        variables: TVariables,
        context: GraphMutationContext<TDefinition>
    ) => Promise<TOnMutateResult> | TOnMutateResult;
    onSettled?: (
        data: TData | undefined,
        error: Error | null,
        variables: TVariables,
        onMutateResult: TOnMutateResult | undefined,
        context: GraphMutationContext<TDefinition>
    ) => Promise<unknown> | unknown;
    onSuccess?: (
        data: TData,
        variables: TVariables,
        onMutateResult: TOnMutateResult | undefined,
        context: GraphMutationContext<TDefinition>
    ) => Promise<unknown> | unknown;
    requestHeaders?: RequestOptions["requestHeaders"];
    select?: (data: GraphQueryData<TDefinition>) => TData;
};

export type GraphMutationOptions<
    TDefinition extends AnyGraphqlDefinition,
    TData = GraphQueryData<TDefinition>,
    TVariables = GraphMutationVariables<TDefinition>,
> = {
    client?: GraphQLClient;
    requestHeaders?: RequestOptions["requestHeaders"];
    select?: (data: GraphQueryData<TDefinition>) => TData;
    variables?: TVariables;
};

export type GraphMutationOptionsResult<
    TDefinition extends AnyGraphqlDefinition,
    TOnMutateResult = unknown,
    TData = GraphQueryData<TDefinition>,
    TVariables = GraphMutationVariables<TDefinition>,
> = UseMutationOptions<TData, Error, TVariables, TOnMutateResult>;

export type GraphQueryOptionsResult<TQueryFnData, TData = TQueryFnData> = Omit<
    UseQueryOptions<TQueryFnData, Error, TData, QueryKey>,
    "queryKey" | "queryFn"
> & {
    queryKey: QueryKey;
    queryFn: QueryFunction<TQueryFnData, QueryKey>;
};
