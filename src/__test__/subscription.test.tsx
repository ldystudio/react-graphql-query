import { afterEach, describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ServerWebSocket } from "bun";
import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import type React from "react";
import { getGraphData, setGraphData } from "../cache";
import { defineGraphql } from "../definition";
import { GraphqlQueryProvider } from "../provider";
import { createGraphqlSubscriptionClient, useGraphSubscription } from "../subscription";

type Operation = {
    id: string;
    socket: ServerWebSocket<undefined>;
    payload: { query: string; variables?: { id: number } };
};

function createServer(failedConnections = 0) {
    const sockets: ServerWebSocket<undefined>[] = [];
    const operations: Operation[] = [];
    const completed: string[] = [];
    const connectionParams: unknown[] = [];
    const server = Bun.serve<undefined>({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request, server) {
            if (server.upgrade(request, { headers: { "sec-websocket-protocol": "graphql-transport-ws" } })) return;
            return new Response("upgrade required", { status: 426 });
        },
        websocket: {
            open(socket) {
                sockets.push(socket);
                if (sockets.length <= failedConnections) socket.close(1012, "retry");
            },
            message(socket, raw) {
                const message = JSON.parse(String(raw));
                if (message.type === "connection_init") {
                    connectionParams.push(message.payload);
                    socket.send(JSON.stringify({ type: "connection_ack" }));
                } else if (message.type === "subscribe") {
                    operations.push({ id: message.id, socket, payload: message.payload });
                } else if (message.type === "complete") {
                    completed.push(message.id);
                }
            },
        },
    });
    servers.push(server);
    return { server, sockets, operations, completed, connectionParams };
}

const servers: Array<ReturnType<typeof Bun.serve>> = [];
const clients: Array<ReturnType<typeof createGraphqlSubscriptionClient>> = [];

function setup(failedConnections = 0) {
    const fixture = createServer(failedConnections);
    const client = createGraphqlSubscriptionClient({
        url: `ws://127.0.0.1:${fixture.server.port}/graphql`,
        connectionParams: () => ({ token: "test-token" }),
        retryWait: () => Promise.resolve(),
    });
    clients.push(client);
    const queryClient = new QueryClient();
    const wrapper = ({ children }: React.PropsWithChildren) => (
        <GraphqlQueryProvider client={{} as GraphQLClient} subscriptionClient={client} queryClient={queryClient}>
            {children}
        </GraphqlQueryProvider>
    );
    return { ...fixture, client, queryClient, wrapper };
}

function send(operation: Operation, payload: unknown) {
    operation.socket.send(JSON.stringify({ id: operation.id, type: "next", payload }));
}

const eventDefinition = defineGraphql<{ events: { id: number; text: string } }, { id: number }>()({
    document: gql`subscription Events($id: Int!) { events(id: $id) { id text } }`,
});

const listDefinition = defineGraphql<{ events: Array<{ id: number; text: string }> }, { id: number }>()({
    document: gql`query EventsList($id: Int!) { events(id: $id) { id text } }`,
});

afterEach(async () => {
    cleanup();
    await Promise.all(clients.splice(0).map((client) => client.dispose()));
    await Promise.all(servers.splice(0).map((server) => server.stop(true)));
});

describe("GraphQL subscription", () => {
    it("共享连接并逐条通知，按目标变量更新查询缓存", async () => {
        const { client, queryClient, wrapper, sockets, operations, connectionParams, completed } = setup();
        const events: string[] = [];
        setGraphData(queryClient, listDefinition, { id: 7 }, [{ id: 1, text: "before" }]);
        const first = renderHook(
            () =>
                useGraphSubscription(eventDefinition, {
                    variables: { id: 7 },
                    onData: (data) => events.push(data.text),
                    cache: {
                        query: listDefinition,
                        queryVariables: { id: 7 },
                        update: (current, data) => [...(current ?? []), data],
                    },
                }),
            { wrapper }
        );
        const second = renderHook(() => useGraphSubscription(eventDefinition, { variables: { id: 8 } }), { wrapper });

        await waitFor(() => expect(operations).toHaveLength(2));
        expect(sockets).toHaveLength(1);
        expect(connectionParams).toEqual([{ token: "test-token" }]);
        expect(first.result.current.status).toBe("connected");
        expect(second.result.current.status).toBe("connected");
        expect(operations[0].payload.variables).toEqual({ id: 7 });
        expect(operations[0].payload.query).toContain("subscription Events");

        const late = renderHook(() => useGraphSubscription(eventDefinition, { variables: { id: 9 } }), { wrapper });
        await waitFor(() => expect(operations).toHaveLength(3));
        expect(late.result.current.status).toBe("connected");
        expect(sockets).toHaveLength(1);
        late.unmount();

        act(() => {
            send(operations[0], { data: { events: { id: 2, text: "one" } } });
            send(operations[0], { data: { events: { id: 3, text: "two" } } });
        });
        await waitFor(() => expect(events).toEqual(["one", "two"]));
        expect(getGraphData(queryClient, listDefinition, { id: 7 })).toEqual([
            { id: 1, text: "before" },
            { id: 2, text: "one" },
            { id: 3, text: "two" },
        ]);
        expect(getGraphData(queryClient, listDefinition, { id: 8 })).toBeUndefined();

        first.unmount();
        await waitFor(() => expect(completed).toContain(operations[0].id));
        expect(client.getConnectionStatus()).toBe("connected");
        second.unmount();
        await waitFor(() => expect(client.getConnectionStatus()).toBe("idle"));
    });

    it("变量变化或禁用时取消旧订阅，相同变量不会重复订阅", async () => {
        const { wrapper, operations, completed } = setup();
        const events: number[] = [];
        const hook = renderHook(
            ({ id, enabled }) =>
                useGraphSubscription(eventDefinition, {
                    variables: { id },
                    enabled,
                    onData: (data) => events.push(data.id),
                }),
            { wrapper, initialProps: { id: 1, enabled: true } }
        );
        await waitFor(() => expect(operations).toHaveLength(1));
        hook.rerender({ id: 1, enabled: true });
        expect(operations).toHaveLength(1);
        hook.rerender({ id: 2, enabled: true });
        await waitFor(() => expect(operations).toHaveLength(2));
        expect(completed).toContain(operations[0].id);
        expect(operations[1].payload.variables).toEqual({ id: 2 });
        act(() => send(operations[1], { data: { events: { id: 2, text: "new" } } }));
        await waitFor(() => expect(events).toEqual([2]));
        hook.rerender({ id: 2, enabled: false });
        await waitFor(() => expect(hook.result.current.status).toBe("idle"));
        await waitFor(() => expect(completed).toContain(operations[1].id));
    });

    it("断线后重连并重新订阅，不可恢复的协议错误会暴露给调用方", async () => {
        const { wrapper, sockets, operations, connectionParams } = setup();
        const hook = renderHook(() => useGraphSubscription(eventDefinition, { variables: { id: 5 } }), { wrapper });
        await waitFor(() => expect(operations).toHaveLength(1));
        act(() => sockets[0].close(1012, "restart"));
        await waitFor(() => expect(operations).toHaveLength(2));
        expect(connectionParams).toHaveLength(2);
        expect(operations[1].payload.variables).toEqual({ id: 5 });
        expect(hook.result.current.status).toBe("connected");
        act(() => sockets[1].close(4401, "unauthorized"));
        await waitFor(() => expect(hook.result.current.status).toBe("error"));
        expect(hook.result.current.error?.message).toContain("4401");
    });

    it("连续多次连接失败后仍继续重试", async () => {
        const { wrapper, sockets, operations } = setup(7);
        const hook = renderHook(() => useGraphSubscription(eventDefinition, { variables: { id: 5 } }), { wrapper });

        await waitFor(() => expect(operations).toHaveLength(1));
        expect(sockets).toHaveLength(8);
        expect(hook.result.current.status).toBe("connected");
    });

    it("更新事件回调时使用最新回调且不重新订阅", async () => {
        const { wrapper, operations } = setup();
        const events: string[] = [];
        const hook = renderHook(
            ({ label }) =>
                useGraphSubscription(eventDefinition, {
                    variables: { id: 1 },
                    onData: (data) => events.push(`${label}:${data.id}`),
                }),
            { wrapper, initialProps: { label: "old" } }
        );

        await waitFor(() => expect(operations).toHaveLength(1));
        hook.rerender({ label: "new" });
        act(() => send(operations[0], { data: { events: { id: 3, text: "message" } } }));
        await waitFor(() => expect(events).toEqual(["new:3"]));
        expect(operations).toHaveLength(1);
    });

    it("同时暴露部分数据的 GraphQL 错误，后续成功可恢复", async () => {
        const { wrapper, operations } = setup();
        const events: number[] = [];
        const hook = renderHook(
            () =>
                useGraphSubscription(eventDefinition, {
                    variables: { id: 1 },
                    onData: (data) => events.push(data.id),
                }),
            { wrapper }
        );
        await waitFor(() => expect(operations).toHaveLength(1));
        act(() =>
            send(operations[0], {
                data: { events: { id: 1, text: "partial" } },
                errors: [{ message: "partial failure" }],
            })
        );
        await waitFor(() => expect(hook.result.current.error?.message).toBe("partial failure"));
        expect(events).toEqual([1]);
        act(() => send(operations[0], { data: { events: { id: 2, text: "ok" } } }));
        await waitFor(() => expect(events).toEqual([1, 2]));
        expect(hook.result.current.error).toBeNull();
        act(() => operations[0].socket.send(JSON.stringify({ id: operations[0].id, type: "complete" })));
        await waitFor(() => expect(hook.result.current.status).toBe("complete"));
    });

    it("未配置订阅客户端时返回错误，禁用时保持空闲", async () => {
        const queryClient = new QueryClient();
        const wrapper = ({ children }: React.PropsWithChildren) => (
            <GraphqlQueryProvider client={{} as GraphQLClient} queryClient={queryClient}>
                {children}
            </GraphqlQueryProvider>
        );
        const hook = renderHook(
            ({ enabled }) =>
                useGraphSubscription(eventDefinition, {
                    variables: { id: 1 },
                    enabled,
                }),
            { wrapper, initialProps: { enabled: false } }
        );
        expect(hook.result.current.status).toBe("idle");
        hook.rerender({ enabled: true });
        await waitFor(() => expect(hook.result.current.error?.message).toBe("GraphQL subscription client is required"));
    });
});
