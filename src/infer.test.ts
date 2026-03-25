import { describe, expect, it } from "bun:test";
import { gql } from "graphql-request";
import { inferGraphParseKey } from "./infer";

describe("inferGraphParseKey", () => {
    it("infers a single nested path", () => {
        expect(
            inferGraphParseKey(gql`
                query {
                    account {
                        login {
                            token
                        }
                    }
                }
            `)
        ).toBe("account.login");
    });

    it("stops at the branching object", () => {
        expect(
            inferGraphParseKey(gql`
                query {
                    ugc {
                        list {
                            nextPage
                            public {
                                id
                            }
                        }
                    }
                }
            `)
        ).toBe("ugc.list");
    });

    it("uses aliases when present", () => {
        expect(
            inferGraphParseKey(gql`
                query {
                    courseAlias: course {
                        listAlias: list {
                            id
                        }
                    }
                }
            `)
        ).toBe("courseAlias.listAlias");
    });
});
