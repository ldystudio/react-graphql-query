import { describe, expect, it } from "bun:test";
import { createInitialDataByParseKey, getGraphLogKey, getGraphQueryKey, getValueByParseKey } from "./key";

describe("key helpers", () => {
    it("creates queryKey from parseKey and variables", () => {
        expect(getGraphQueryKey("ugc.detail", { id: 1, mode: "full" })).toEqual(["ugc", "detail", 1, "full"]);
    });

    it("creates logKey from parseKey", () => {
        expect(getGraphLogKey("ugc.list.comment")).toBe("ugc-list-comment");
        expect(getGraphLogKey({ parseKey: "account.home" })).toBe("account-home");
        expect(getGraphLogKey(undefined)).toBe("");
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
