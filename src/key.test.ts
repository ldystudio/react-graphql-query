import { describe, expect, it } from "bun:test";
import { createInitialDataByParseKey, getGraphQueryKey, getValueByParseKey } from "./key";

describe("key helpers", () => {
    it("creates queryKey from parseKey and variables", () => {
        expect(getGraphQueryKey("ugc.detail", { id: 1, mode: "full" })).toEqual(["ugc", "detail", 1, "full"]);
    });

    it("gets deep value by parseKey", () => {
        expect(
            getValueByParseKey(
                {
                    course: {
                        steamCourse: {
                            list: [{ id: 1 }],
                        },
                    },
                },
                "course.steamCourse.list"
            )
        ).toEqual([{ id: 1 }]);
    });

    it("wraps initial data to root shape", () => {
        expect(createInitialDataByParseKey("ugc.detail", { id: 1 })).toEqual({
            ugc: {
                detail: {
                    id: 1,
                },
            },
        });
    });
});
