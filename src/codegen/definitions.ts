import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
    GraphqlCodegenDefinitionClientConfig,
    GraphqlCodegenResolvedDefinitionsConfig,
    GraphqlCodegenResolvedTarget,
} from "./types";

interface OperationDocument {
    documentName: string;
    dataType: string;
    variablesType: string;
}

function parseOperationDocuments(generatedSource: string) {
    const documents: OperationDocument[] = [];
    const documentPattern = /export const (\w+)Document = [\s\S]*?as unknown as DocumentNode<(\w+),\s*(\w+)>;/g;

    for (const match of generatedSource.matchAll(documentPattern)) {
        documents.push({
            documentName: match[1],
            dataType: match[2],
            variablesType: match[3],
        });
    }

    return documents;
}

function toConstantName(documentName: string) {
    return documentName
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
        .replace(/([a-z\d])([A-Z])/g, "$1_$2")
        .toUpperCase();
}

function getClientName(client: string | GraphqlCodegenDefinitionClientConfig | undefined) {
    return typeof client === "string" ? client : client?.name;
}

function createDefinition(document: OperationDocument, definitions: GraphqlCodegenResolvedDefinitionsConfig) {
    const gen = definitions.generatedImportName;
    const clientName = getClientName(definitions.client);
    const properties = [
        clientName ? `    client: ${clientName},` : undefined,
        `    document: ${gen}.${document.documentName}Document`,
    ].filter(Boolean);

    return `export const ${toConstantName(document.documentName)} = defineGraphql<${gen}.${document.dataType}, ${gen}.${document.variablesType}>()({\n${properties.join("\n")}\n});`;
}

function hasNamedImport(sourceText: string, name: string, importPath: string) {
    const pattern = new RegExp(
        `import\\s+\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from\\s+["']${escapeRegExp(importPath)}["']`
    );

    return pattern.test(sourceText);
}

function hasNamespaceImport(sourceText: string, name: string, importPath: string) {
    const pattern = new RegExp(
        `import\\s+\\*\\s+as\\s+${escapeRegExp(name)}\\s+from\\s+["']${escapeRegExp(importPath)}["']`
    );

    return pattern.test(sourceText);
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRequiredImports(sourceText: string, definitions: GraphqlCodegenResolvedDefinitionsConfig) {
    const imports: string[] = [];
    const gen = definitions.generatedImportName;

    if (!hasNamedImport(sourceText, "defineGraphql", "@ldystudio/react-graphql-query")) {
        imports.push('import { defineGraphql } from "@ldystudio/react-graphql-query";');
    }

    if (!hasNamespaceImport(sourceText, gen, definitions.generatedImportPath)) {
        imports.push(`import * as ${gen} from "${definitions.generatedImportPath}";`);
    }

    if (
        typeof definitions.client === "object" &&
        definitions.client.importPath &&
        !hasNamedImport(sourceText, definitions.client.name, definitions.client.importPath)
    ) {
        imports.push(`import { ${definitions.client.name} } from "${definitions.client.importPath}";`);
    }

    return imports;
}

async function readOptionalFile(filePath: string) {
    if (!existsSync(filePath)) {
        return "";
    }

    return readFile(filePath, "utf8");
}

export async function syncGraphqlDefinitionsTarget(target: GraphqlCodegenResolvedTarget) {
    if (!target.definitions) {
        return undefined;
    }

    const definitions = target.definitions;
    const generatedSource = await readFile(target.outputPath, "utf8");
    const definitionsSource = await readOptionalFile(definitions.outputPath);
    const missingDefinitions = parseOperationDocuments(generatedSource)
        .filter(
            (document) =>
                !definitionsSource.includes(`${definitions.generatedImportName}.${document.documentName}Document`)
        )
        .map((document) => createDefinition(document, definitions));
    const requiredImports = getRequiredImports(definitionsSource, definitions);

    if (missingDefinitions.length === 0 && requiredImports.length === 0) {
        return definitions.outputRelativePath;
    }

    const importsText =
        requiredImports.length > 0 ? `${requiredImports.join("\n")}\n${definitionsSource ? "\n" : ""}` : "";
    const separator = definitionsSource.endsWith("\n") || !definitionsSource ? "\n" : "\n\n";
    const nextSource = `${importsText}${definitionsSource}${missingDefinitions.length > 0 ? `${separator}${missingDefinitions.join("\n\n")}\n` : ""}`;

    await mkdir(dirname(definitions.outputPath), { recursive: true });
    await writeFile(definitions.outputPath, nextSource);

    return definitions.outputRelativePath;
}
