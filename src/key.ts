import type { RequestOptions } from "graphql-request";
import type { GraphqlDefinition } from "./definition";

type GraphParseKeySource = string | Pick<GraphqlDefinition<unknown>, "parseKey">;

export function getGraphParseKey(input: GraphParseKeySource) {
    return typeof input === "string" ? input : input.parseKey;
}

function isGraphParseKeySource(input: unknown): input is GraphParseKeySource {
    return (
        typeof input === "string" ||
        (typeof input === "object" && input !== null && typeof Reflect.get(input, "parseKey") === "string")
    );
}

export function getParsePath(input: GraphParseKeySource) {
    return getGraphParseKey(input).split(".").filter(Boolean);
}

export function getGraphQueryKey(input: GraphParseKeySource, variables?: RequestOptions["variables"]) {
    const path = getParsePath(input);

    if (variables == null) {
        return path;
    }

    return [...path, ...Object.values(variables)];
}

export function getGraphLogKey(input?: unknown) {
    if (!isGraphParseKeySource(input)) {
        return "";
    }

    return getGraphParseKey(input).replace(/\./g, "-");
}

export function getValueByParseKey<T, const ParseKey extends string>(
    data: T,
    parseKey: ParseKey
): import("./types").GraphValueByParseKey<T, ParseKey>;
export function getValueByParseKey<T, const TDefinition extends Pick<GraphqlDefinition<unknown>, "parseKey">>(
    data: T,
    definition: TDefinition
): import("./types").GraphValueByParseKey<T, TDefinition["parseKey"]>;
export function getValueByParseKey(data: unknown, input: GraphParseKeySource) {
    return getParsePath(input).reduce<unknown>((acc, key) => {
        if (acc == null || typeof acc !== "object") {
            return undefined;
        }

        return Reflect.get(acc, key);
    }, data);
}

export function createInitialDataByParseKey(input: GraphParseKeySource, initialData: unknown) {
    return getParsePath(input).reduceRight<unknown>((acc, key) => ({ [key]: acc }), initialData);
}
