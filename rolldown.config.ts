import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

const removeCommentsPlugin = {
    name: 'remove-comments',
    renderChunk(code: string) {
        return code
            .replace(/\/\*(?!\s*@__(?:PURE|NO_SIDE_EFFECTS)__\s*\*\/)[\s\S]*?\*\//g, '')
            .replace(/\/\/#region.*\n?/g, '')
            .replace(/\/\/#endregion\n?/g, '')
            .replace(/\n{3,}/g, '\n\n');
    },
};

export default defineConfig([
    {
        input: 'src/index.ts',
        external: ['react', /^react\//, '@tanstack/react-query', 'graphql-request', 'graphql'],
        output: {
            file: 'dist/index.js',
            format: 'esm',
        },
        plugins: [removeCommentsPlugin],
    },
    {
        input: 'src/index.ts',
        external: ['react', /^react\//, '@tanstack/react-query', 'graphql-request', 'graphql'],
        output: {
            codeSplitting: false,
            dir: 'dist-types',
            entryFileNames: 'index.d.ts',
            format: 'esm',
        },
        plugins: [
            dts({
                emitDtsOnly: true,
            }),
            removeCommentsPlugin,
        ],
    },
]);
