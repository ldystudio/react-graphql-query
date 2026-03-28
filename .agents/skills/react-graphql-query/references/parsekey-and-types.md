# ParseKey And Types

## `parseKey` inference

Default inference is conservative.

It keeps drilling down only while:

- each level has exactly one selected field
- the shape is still unambiguous

Inference stops early when:

- there are multiple top-level fields
- a nested object branches
- the shape becomes opaque or ambiguous

When the inferred path is not what the user wants, recommend setting `parseKey` explicitly.

## `key` vs `parseKey`

- `parseKey` controls how the GraphQL root object is parsed
- `key` controls cache identity

Recommend explicit `key` when the cache identity should remain stable even if the parse path is verbose or implementation-oriented.

## Typed documents

Prefer this pattern:

```ts
import { ProductDocument } from "./__generated__/graphql";

const PRODUCT_DETAIL = defineGraphql({
    document: ProductDocument,
    parseKey: "catalog.product",
});
```

Do not suggest `declare const ProductDocument` in executable examples. The document must be a real runtime value.

## Codegen guidance

- codegen results often include optional `__typename`
- this library's type helpers intentionally ignore `__typename` during parse-path and value inference
- if a user sees inference stop at a broader node than expected, check whether the document actually branches at that level

## Common recommendations

- simple single-path query -> let `parseKey` infer automatically
- branching query -> write `parseKey` explicitly
- cursor pagination -> parse to the connection object
- confusing cache identity -> add explicit `key`
