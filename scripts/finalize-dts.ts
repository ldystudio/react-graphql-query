import { $ } from "bun";

const DIST_DIR = "dist";
const DTS_DIR = "dist-types";
const TARGET_FILE = `${DIST_DIR}/index.d.ts`;
const EMPTY_DTS = "export { };";
const PREFERRED_ENTRY_FILE = "index.d.ts";

const dtsFiles = Array.from(new Bun.Glob("*.d.ts").scanSync({ cwd: DTS_DIR }));

if (dtsFiles.length === 0) {
    throw new Error("No declaration files were generated.");
}

const bundledFiles: string[] = [];

for (const file of dtsFiles) {
    const content = (await Bun.file(`${DTS_DIR}/${file}`).text()).trim();

    if (content !== EMPTY_DTS) {
        bundledFiles.push(file);
    }
}

const targetSource =
    bundledFiles.find((file) => file === PREFERRED_ENTRY_FILE) ??
    (bundledFiles.length === 1 ? bundledFiles[0] : undefined);

if (!targetSource) {
    throw new Error(
        `Expected a single bundled declaration file or a preferred ${PREFERRED_ENTRY_FILE} entry, received: ${
            bundledFiles.join(", ") || "none"
        }`
    );
}

await $`mkdir -p ${DIST_DIR}`;
await Bun.write(TARGET_FILE, Bun.file(`${DTS_DIR}/${targetSource}`));
await $`rm -rf ${DTS_DIR}`;
