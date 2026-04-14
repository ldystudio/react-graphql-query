import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";

const removeCommentsPlugin = {
    name: "remove-comments",
    renderChunk(code: string) {
        return code
            .replace(/\/\*(?!\s*@__(?:PURE|NO_SIDE_EFFECTS)__\s*\*\/)[\s\S]*?\*\//g, "")
            .replace(/\/\/#region.*\n?/g, "")
            .replace(/\/\/endregion\n?/g, "")
            .replace(/\n{3,}/g, "\n\n");
    },
};

const entries = {
    index: "src/index.ts",
    "codegen/index": "src/codegen/index.ts",
    "codegen/cli": "src/codegen/cli.ts",
};

const externals = [
    "react",
    /^react\//,
    "@tanstack/react-query",
    "graphql-request",
    "graphql",
    "@graphql-codegen/cli",
    "jiti",
    "typescript",
    /^node:/,
];

export default defineConfig([
    {
        input: entries,
        external: externals,
        output: {
            dir: "dist",
            entryFileNames: "[name].js",
            format: "esm",
        },
        plugins: [removeCommentsPlugin],
    },
    {
        input: entries,
        external: externals,
        output: {
            dir: "dist-types",
            entryFileNames: "[name].d.ts",
            format: "esm",
        },
        plugins: [
            dts({
                emitDtsOnly: true,
            }),
            removeCommentsPlugin,
        ],
    },
]);
