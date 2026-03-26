import { describe, expect, it } from "bun:test";
import * as library from "./index";

describe("public exports", () => {
    it("exposes the documented runtime API from the root entry", () => {
        expect(library.defineGraphql).toBeFunction();
        expect(library.GraphqlClientProvider).toBeFunction();
        expect(library.useGraphQuery).toBeFunction();
        expect(library.useGraphqlClient).toBeFunction();
        expect(library.graphQuery).toBeFunction();
        expect(library.graphQueryOptions).toBeFunction();
        expect(library.GRAPH_DEBUG_PARSE_KEY_HEADER).toBe("x-graph-parse-key");
        expect(library.inferGraphParseKey).toBeFunction();
        expect(library.getGraphParseKey).toBeFunction();
        expect(library.getGraphLogKey).toBeFunction();
        expect(library.getGraphQueryKey).toBeFunction();
        expect(library.getParsePath).toBeFunction();
        expect(library.getValueByParseKey).toBeFunction();
        expect(library.createInitialDataByParseKey).toBeFunction();
    });
});
