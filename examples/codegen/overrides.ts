import type { GraphqlCodegenOperationTypeOverrideRule } from "@ldystudio/react-graphql-query/codegen";

export const mainOperationTypeOverrides: GraphqlCodegenOperationTypeOverrideRule[] = [
    {
        operation: "EntityDetailQuery",
        path: "catalog.entity",
        type: "EntityApi.Detail"
    },
    {
        operation: "EntityFeedQuery",
        path: "catalog.feed.items[]",
        type: "EntityApi.FeedItem"
    }
];

export const secondaryOperationTypeOverrides: GraphqlCodegenOperationTypeOverrideRule[] = [
    {
        operation: "RemoteResourceQuery",
        path: "resource.payload",
        type: "RemoteResourceApi.Payload"
    }
];
