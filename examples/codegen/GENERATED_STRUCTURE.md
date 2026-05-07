# Codegen Output Structure Example

This example uses placeholder operation names and placeholder field paths only. Do not copy private schema fields into public examples.

## Source files

```text
src/service/gql/
├── main.graphql
├── secondary.graphql
├── main.gql.ts              # generated/append-only definition wrapper
└── secondary.gql.ts         # generated/append-only definition wrapper with custom client
```

## Generated files

```text
src/service/__generated__/
├── main.ts                  # generated TypedDocumentNode output for main target
└── secondary.ts             # generated TypedDocumentNode output for secondary target
```

## Example generated wrapper: `src/service/gql/main.gql.ts`

```ts
import { defineGraphql } from "@ldystudio/react-graphql-query";
import * as Gen from "../__generated__/main";

export const ENTITY_DETAIL = defineGraphql<Gen.EntityDetailQuery, Gen.EntityDetailQueryVariables>()({
    document: Gen.EntityDetailDocument
});

export const ENTITY_FEED = defineGraphql<Gen.EntityFeedQuery, Gen.EntityFeedQueryVariables>()({
    document: Gen.EntityFeedDocument
});
```

## Example generated wrapper with client: `src/service/gql/secondary.gql.ts`

```ts
import { defineGraphql } from "@ldystudio/react-graphql-query";
import { SecondaryGraphqlClient } from "~/service/client";
import * as Gen from "../__generated__/secondary";

export const REMOTE_RESOURCE = defineGraphql<Gen.RemoteResourceQuery, Gen.RemoteResourceQueryVariables>()({
    client: SecondaryGraphqlClient,
    document: Gen.RemoteResourceDocument
});
```

## Safe manual edits

The definitions generator only appends missing documents. Existing definitions are preserved, so teams can safely add project-specific options:

```ts
export const ENTITY_DETAIL = defineGraphql<EntityApi.Detail, Gen.EntityDetailQueryVariables>()({
    parseKey: "catalog.entity",
    document: Gen.EntityDetailDocument,
    key: ["Entity", "Detail"]
});
```
