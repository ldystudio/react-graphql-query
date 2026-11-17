# Subscription Flows

- Define subscription operations with `defineGraphql`, or use generated definitions. Supply an actual `graphql-transport-ws` endpoint and connection parameters established with the server.
- Create one `createGraphqlSubscriptionClient({ url, connectionParams })` per connection configuration and inject it as `subscriptionClient` on `GraphqlQueryProvider` or `GraphqlClientProvider`. `options.client` takes precedence. Create clients only in a runtime with WebSocket support.
- Use `useGraphSubscription(definition, { variables, enabled, onData, cache })`. `onData` receives every parsed event. The optional `cache` takes `query`, `queryVariables`, and `update(currentData, event)` for one target query; returning `undefined` leaves the cache unchanged.
- Status is `idle`, `connecting`, `connected`, `complete`, or `error`; `error` also reports errors returned with partial data. Variables changing, disabling, or unmounting cancels the old subscription.
- Connections are lazy and shared, with continuous backoff on retryable disconnection by default. Fatal protocol errors such as 4401 are reported, not retried. `connectionParams` is re-evaluated on reconnect; use `client.terminate()` when changed credentials require reconnecting.
- Cache writes do not cancel in-flight queries, which can overwrite an event update; coordinate query and subscription timing when needed. Do not imply subscription writes automatically reconcile pending queries.
