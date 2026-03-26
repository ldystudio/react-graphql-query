import { describe, expect, it } from "bun:test";
import { gql } from "graphql-request";
import { defineGraphql } from "./definition";

describe("defineGraphql", () => {
    it("auto infers parseKey when omitted", () => {
        const definition = defineGraphql<{ session: { revoke: { ok: boolean } } }>()({
            document: gql`
                mutation {
                    session {
                        revoke {
                            ok
                        }
                    }
                }
            `,
        });

        expect(definition.parseKey).toBe("session.revoke");
    });

    it("keeps manual parseKey override", () => {
        const definition = defineGraphql<{ catalog: { products: { nodes: string[] } } }>()({
            parseKey: "catalog.products.nodes",
            document: gql`
                query {
                    catalog {
                        products {
                            nextCursor
                            nodes
                        }
                    }
                }
            `,
        });

        expect(definition.parseKey).toBe("catalog.products.nodes");
    });
});
