import { describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { gql } from "graphql-request";
import { defineGraphql } from "./definition";
import type { GraphQueryData, GraphQueryOptions } from "./types";

type Item = {
    id: number;
    title: string;
};

interface CommonStatusRoot {
    system: {
        isOnline: boolean;
        release: {
            minVersion: string;
        };
    };
}

type ItemListRoot = {
    catalog: {
        items: {
            nodes: Item[];
        };
    };
};

const EXPLICIT_ITEM_LIST = defineGraphql<ItemListRoot>()({
    parseKey: "catalog.items.nodes",
    document: gql`
        query {
            catalog {
                items {
                    nodes {
                        id
                        title
                    }
                }
            }
        }
    `,
});

const INFERRED_ITEM_LIST = defineGraphql<ItemListRoot>()({
    document: gql`
        query {
            catalog {
                items {
                    nodes {
                        id
                        title
                    }
                }
            }
        }
    `,
});

const explicitItemListData: GraphQueryData<typeof EXPLICIT_ITEM_LIST> = [{ id: 1, title: "explicit" }];
void explicitItemListData;

const inferredItemListData: GraphQueryData<typeof INFERRED_ITEM_LIST> = [{ id: 1, title: "inferred" }];
void inferredItemListData;

const SYSTEM_STATUS = defineGraphql<CommonStatusRoot>()({
    document: gql`
        query {
            system {
                isOnline
                release {
                    minVersion
                }
            }
        }
    `,
});

const systemStatusParseKey: "system" = SYSTEM_STATUS.parseKey;
void systemStatusParseKey;

const systemStatusData: GraphQueryData<typeof SYSTEM_STATUS> = {
    isOnline: false,
    release: {
        minVersion: "1.0.0",
    },
};
void systemStatusData;

const BRANCHING_ITEM_LIST = defineGraphql<{
    catalog: {
        items: {
            nextPage: number;
            nodes: Item[];
        };
    };
}>()({
    document: gql`
        query {
            catalog {
                items {
                    nextPage
                    nodes {
                        id
                        title
                    }
                }
            }
        }
    `,
});

const branchingItemListData: GraphQueryData<typeof BRANCHING_ITEM_LIST> = {
    nextPage: 1,
    nodes: [{ id: 1, title: "branching" }],
};
void branchingItemListData;

const OPAQUE_ARRAY_BUNDLE = defineGraphql<{
    assetBundle: {
        files: Array<{
            payload: {
                name: string;
                timePeriod: string;
            };
        }>;
    };
}>()({
    document: gql`
        query {
            assetBundle {
                files
            }
        }
    `,
});

const opaqueArrayBundleData: GraphQueryData<typeof OPAQUE_ARRAY_BUNDLE> = {
    files: [
        {
            payload: {
                name: "campaign",
                timePeriod: "2025-12",
            },
        },
    ],
};
void opaqueArrayBundleData;

void ({ queryClient: new QueryClient() } satisfies GraphQueryOptions<typeof EXPLICIT_ITEM_LIST>);

// @ts-expect-error `enabled` is a hook-only option and should not be accepted by `graphQuery`.
void ({ queryClient: new QueryClient(), enabled: false } satisfies GraphQueryOptions<typeof EXPLICIT_ITEM_LIST>);

describe("type contracts", () => {
    it("keeps explicit parseKey leaf typing and conservatively infers omitted parseKey types", () => {
        expect(true).toBe(true);
    });
});
