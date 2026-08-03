# Codegen Workflow

## Recommended setup

1. Install `@graphql-codegen/cli`, `@graphql-codegen/client-preset`, and `graphql` as development dependencies.
2. Create a project config with `defineGraphqlCodegenProject` from `@ldystudio/react-graphql-query/codegen`.
3. Run `react-graphql-query-codegen --config graphql.codegen.ts`.
4. Import the generated `defineGraphql` wrappers from the configured `definitions.output` file.

## Minimal config

```ts
import { defineGraphqlCodegenProject } from "@ldystudio/react-graphql-query/codegen";

export default defineGraphqlCodegenProject({
    targets: {
        main: {
            schema: "https://example.com/graphql",
            documents: ["src/service/gql/main.graphql"],
            output: "src/service/__generated__/main.ts",
            definitions: {
                output: "src/service/gql/main.gql.ts",
            },
        },
    },
});
```

## Generated definitions

The definitions generator is append-only. It adds wrappers for missing operations but does not overwrite existing definitions, so users can keep custom `parseKey`, `key`, default variables, root types, or `client` settings.

When a target needs a dedicated client, configure `definitions.client` with its exported `name` and `importPath`.

## Advanced configuration

- Use `format.command` to format generated files after codegen.
- Use target operation type overrides only when the generated operation type needs a known correction.
- Prefer the public project config and CLI over calling `buildGraphqlCodegenConfig`, `syncGraphqlDefinitionsTarget`, or `pruneGeneratedTarget` directly unless the user is building custom tooling.
