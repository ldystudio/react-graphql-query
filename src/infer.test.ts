import { describe, expect, it } from "bun:test";
import { gql } from "graphql-request";
import { inferGraphParseKey } from "./infer";

describe("inferGraphParseKey", () => {
    it("infers a single nested path", () => {
        expect(
            inferGraphParseKey(gql`
                query {
                    store {
                        inventory {
                            nodes {
                                id
                            }
                        }
                    }
                }
            `)
        ).toBe("store.inventory.nodes");
    });

    it("stops at the branching object", () => {
        expect(
            inferGraphParseKey(gql`
                query {
                    catalog {
                        products {
                            nextPage
                            nodes {
                                id
                            }
                        }
                    }
                }
            `)
        ).toBe("catalog.products");
    });

    it("uses aliases when present", () => {
        expect(
            inferGraphParseKey(gql`
                query {
                    storefrontAlias: storefront {
                        featuredAlias: featuredProducts {
                            id
                        }
                    }
                }
            `)
        ).toBe("storefrontAlias.featuredAlias");
    });

    it("throws when the document has multiple top-level fields", () => {
        expect(() =>
            inferGraphParseKey(gql`
                query {
                    store {
                        id
                    }
                    viewer {
                        id
                    }
                }
            `)
        ).toThrow("exactly one top-level field");
    });

    it("throws when the document does not contain an operation", () => {
        expect(() =>
            inferGraphParseKey(gql`
                fragment UserProfile on User {
                    id
                }
            `)
        ).toThrow("does not contain an operation definition");
    });
});
