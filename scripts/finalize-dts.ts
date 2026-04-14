import { mkdir, readdir, rename } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { $ } from "bun";

const DIST_DIR = "dist";
const DTS_DIR = "dist-types";
const EMPTY_DTS = "export { };";

const entryRenames = [
    ["index2.d.ts", "index.d.ts"],
    ["codegen/index2.d.ts", "codegen/index.d.ts"],
    ["codegen/cli2.d.ts", "codegen/cli.d.ts"],
] as const;

const relocatedArtifacts = [
    {
        pattern: /^prune-[^.]+\.js$/,
        targetPath: "codegen/shared.js",
        rewriteTargets: [
            ["codegen/index.js", (fileName: string) => `../${fileName}`, "./shared.js"],
            ["codegen/cli.js", (fileName: string) => `../${fileName}`, "./shared.js"],
        ],
    },
    {
        pattern: /^types-[^.]+\.d\.ts$/,
        targetPath: "codegen/types.d.ts",
        rewriteTargets: [
            ["codegen/index.d.ts", (fileName: string) => `../${fileName.replace(/\.d\.ts$/, ".js")}`, "./types.js"],
            ["codegen/cli.d.ts", (fileName: string) => `../${fileName.replace(/\.d\.ts$/, ".js")}`, "./types.js"],
        ],
    },
] as const;

async function collectDeclarationFiles(dirPath: string): Promise<string[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
        entries.map(async (entry) => {
            const nextPath = join(dirPath, entry.name);
            if (entry.isDirectory()) {
                return collectDeclarationFiles(nextPath);
            }

            return entry.name.endsWith(".d.ts") ? [nextPath] : [];
        })
    );

    return files.flat();
}

async function rewriteFile(filePath: string, rewrite: (sourceText: string) => string) {
    const file = Bun.file(filePath);
    const sourceText = await file.text();
    const nextSourceText = rewrite(sourceText);

    if (nextSourceText !== sourceText) {
        await Bun.write(filePath, nextSourceText);
    }
}

async function renameIfExists(from: string, to: string) {
    const fromPath = join(DIST_DIR, from);

    if (!(await Bun.file(fromPath).exists())) {
        return false;
    }

    const toPath = join(DIST_DIR, to);
    await mkdir(dirname(toPath), { recursive: true });
    await rename(fromPath, toPath);

    return true;
}

const dtsFiles = await collectDeclarationFiles(DTS_DIR);
if (dtsFiles.length === 0) {
    throw new Error("No declaration files were generated.");
}

for (const sourcePath of dtsFiles) {
    const content = (await Bun.file(sourcePath).text()).trim();
    if (content === EMPTY_DTS) {
        continue;
    }

    const relativePath = relative(DTS_DIR, sourcePath);
    const targetPath = join(DIST_DIR, relativePath);

    await mkdir(dirname(targetPath), { recursive: true });
    await Bun.write(targetPath, Bun.file(sourcePath));
}

for (const [from, to] of entryRenames) {
    await renameIfExists(from, to);
}

const distEntries = await readdir(DIST_DIR, { withFileTypes: true });

for (const artifact of relocatedArtifacts) {
    const matchedEntry = distEntries.find((entry) => entry.isFile() && artifact.pattern.test(entry.name));

    if (!matchedEntry) {
        continue;
    }

    await renameIfExists(matchedEntry.name, artifact.targetPath);

    for (const [filePath, fromBuilder, toValue] of artifact.rewriteTargets) {
        await rewriteFile(join(DIST_DIR, filePath), (sourceText) =>
            sourceText.replace(fromBuilder(matchedEntry.name), toValue)
        );
    }
}

await $`rm -rf ${DTS_DIR}`;
