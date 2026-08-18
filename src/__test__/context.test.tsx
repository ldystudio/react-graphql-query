import { describe, expect, it } from "bun:test";
import { renderHook } from "@testing-library/react";
import type { GraphQLClient } from "graphql-request";
import type React from "react";
import { useGraphqlClient } from "../context";
import { GraphqlClientProvider } from "../provider";

function createClient() {
    return { request: async () => ({}) } as unknown as GraphQLClient;
}

describe("GraphQL 客户端上下文", () => {
    it("无 provider 时 useGraphqlClient 返回 undefined", () => {
        const { result } = renderHook(() => useGraphqlClient());

        expect(result.current).toBeUndefined();
    });

    it("有 provider 时 useGraphqlClient 返回客户端实例", () => {
        const client = createClient();
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlClientProvider client={client}>{children}</GraphqlClientProvider>
        );
        const { result } = renderHook(() => useGraphqlClient(), { wrapper });

        expect(result.current).toBe(client);
    });
});
