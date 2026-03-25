import { describe, expect, it } from "bun:test";
import { gql } from "graphql-request";
import { defineGraphql } from "./definition";

describe("defineGraphql", () => {
    it("auto infers parseKey when omitted", () => {
        const definition = defineGraphql<{ account: { logout: { ok: boolean } } }>()({
            document: gql`
                mutation {
                    account {
                        logout {
                            ok
                        }
                    }
                }
            `,
        });

        expect(definition.parseKey).toBe("account.logout");
    });

    it("keeps manual parseKey override", () => {
        const definition = defineGraphql<{ ugc: { list: { public: string[] } } }>()({
            parseKey: "ugc.list.public",
            document: gql`
                query {
                    ugc {
                        list {
                            nextPage
                            public
                        }
                    }
                }
            `,
        });

        expect(definition.parseKey).toBe("ugc.list.public");
    });
});
