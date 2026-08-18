import { describe, expect, it } from "bun:test";
import ts from "typescript";
import { parseTypeExpression, parseTypePath, replaceTypeAtPath } from "../codegen/type-path";

const context = {
    filePath: "generated.ts",
    operation: "DemoQuery",
    path: "demo.path",
};

function typeOf(expression: string) {
    return parseTypeExpression(expression);
}

function printNode(node: ts.Node) {
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

    return printer.printNode(ts.EmitHint.Unspecified, node, ts.createSourceFile("t.ts", "", ts.ScriptTarget.Latest));
}

function compactText(node: ts.Node) {
    return printNode(node).replace(/\s+/g, " ").trim();
}

describe("parseTypePath", () => {
    it("解析普通段与数组段", () => {
        expect(parseTypePath("foo.bar[]")).toEqual([
            { name: "foo", isArrayElement: false },
            { name: "bar", isArrayElement: true },
        ]);
    });

    it("空路径抛错", () => {
        expect(() => parseTypePath("")).toThrow("Type override path must not be empty");
    });

    it("空段抛错", () => {
        expect(() => parseTypePath("foo..bar")).toThrow('Invalid type override path segment ""');
        expect(() => parseTypePath("foo.[]")).toThrow('Invalid type override path segment "[]"');
    });
});

describe("parseTypeExpression", () => {
    it("解析出类型节点", () => {
        expect(ts.isTypeNode(typeOf("string"))).toBe(true);
        expect(typeOf("{ id: string }").kind).toBe(ts.SyntaxKind.TypeLiteral);
    });

    it("替换可空联合的嵌套属性时保留 null", () => {
        const result = replaceTypeAtPath(
            typeOf("{ a: { b: string } | null }"),
            parseTypePath("a.b"),
            typeOf("number"),
            context
        );

        expect(compactText(result)).toBe("{ a: { b: number; } | null; }");
    });
});

describe("replaceTypeAtPath", () => {
    it("替换普通属性类型", () => {
        const result = replaceTypeAtPath(typeOf("{ id: string }"), parseTypePath("id"), typeOf("number"), context);

        expect(compactText(result)).toBe("{ id: number; }");
    });

    it("替换多属性对象时保留其他成员", () => {
        const result = replaceTypeAtPath(
            typeOf("{ id: string; name: string }"),
            parseTypePath("name"),
            typeOf("number"),
            context
        );

        expect(compactText(result)).toBe("{ id: string; name: number; }");
    });

    it("替换数组元素类型（T[] 语法）", () => {
        const result = replaceTypeAtPath(
            typeOf("{ items: string[] }"),
            parseTypePath("items[]"),
            typeOf("number"),
            context
        );

        expect(compactText(result)).toBe("{ items: number[]; }");
    });

    it("替换数组元素类型（Array<T> 语法）", () => {
        const result = replaceTypeAtPath(
            typeOf("{ items: Array<string> }"),
            parseTypePath("items[]"),
            typeOf("number"),
            context
        );

        expect(compactText(result)).toBe("{ items: Array<number>; }");
    });

    it("替换可空联合的叶子类型时 null 随路径耗尽被替换", () => {
        const result = replaceTypeAtPath(
            typeOf("{ id: string | null }"),
            parseTypePath("id"),
            typeOf("number"),
            context
        );

        expect(compactText(result)).toBe("{ id: number; }");
    });

    it("遇到非对象类型时抛错", () => {
        expect(() => replaceTypeAtPath(typeOf("string"), parseTypePath("a"), typeOf("number"), context)).toThrow(
            'Expected an object type while traversing "demo.path"'
        );
    });

    it("属性不存在时抛错", () => {
        expect(() => replaceTypeAtPath(typeOf("{ a: string }"), parseTypePath("b"), typeOf("number"), context)).toThrow(
            'Property "b" was not found while traversing "demo.path"'
        );
    });

    it("computed 属性名无法匹配时抛错", () => {
        expect(() =>
            replaceTypeAtPath(typeOf("{ [key]: string }"), parseTypePath("key"), typeOf("number"), context)
        ).toThrow('Property "key" was not found while traversing "demo.path"');
    });

    it("数组段遇到非数组类型时抛错", () => {
        expect(() =>
            replaceTypeAtPath(typeOf("{ item: string }"), parseTypePath("item[]"), typeOf("number"), context)
        ).toThrow('Expected an array type while traversing "demo.path"');
    });

    it("数组段遇到非 Array 泛型引用时抛错", () => {
        expect(() =>
            replaceTypeAtPath(typeOf("{ item: Foo<string> }"), parseTypePath("item[]"), typeOf("number"), context)
        ).toThrow('Expected an array type while traversing "demo.path"');
    });

    it("路径耗尽时直接返回替换类型", () => {
        const result = replaceTypeAtPath(typeOf("string"), [], typeOf("number"), context);

        expect(compactText(result)).toBe("number");
    });
});
