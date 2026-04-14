import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import ts from "typescript";
import { applyOperationTypeOverridesToSource } from "./overrides";
import type { GraphqlCodegenResolvedTarget, GraphqlCodegenTargetTransformContext } from "./types";

function stripLeadingEslintDisableBanner(sourceText: string) {
    return sourceText.replace(/^(\uFEFF?)\/\* eslint-disable \*\/\r?\n(\r?\n)?/, "$1");
}

function isExported(statement: ts.Statement) {
    return ts.canHaveModifiers(statement)
        ? (ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
        : false;
}

function getExportedName(statement: ts.Statement) {
    if (!isExported(statement)) {
        return undefined;
    }

    if (
        ts.isTypeAliasDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)
    ) {
        return statement.name?.text;
    }

    if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
        const declaration = statement.declarationList.declarations[0];

        return ts.isIdentifier(declaration.name) ? declaration.name.text : undefined;
    }

    return undefined;
}

function collectDependencies(statement: ts.Statement, knownNames: Set<string>, selfName: string) {
    const dependencies = new Set<string>();

    function visit(node: ts.Node) {
        if (ts.isIdentifier(node)) {
            const name = node.text;

            if (name !== selfName && knownNames.has(name)) {
                dependencies.add(name);
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(statement);

    return dependencies;
}

function isNullishTypeNode(node: ts.TypeNode) {
    return (
        node.kind === ts.SyntaxKind.UndefinedKeyword ||
        (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword)
    );
}

function stripNullishFromTypeNode(typeNode: ts.TypeNode) {
    const result = ts.transform<ts.TypeNode>(typeNode, [
        (context) => {
            const visitor: ts.Visitor = (node) => {
                if (ts.isUnionTypeNode(node)) {
                    const types = node.types
                        .map((member) => ts.visitNode(member, visitor))
                        .filter((member): member is ts.TypeNode => member !== undefined)
                        .filter((member) => !isNullishTypeNode(member));

                    if (types.length === 0) {
                        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword);
                    }

                    if (types.length === 1) {
                        return types[0];
                    }

                    return ts.factory.updateUnionTypeNode(node, ts.factory.createNodeArray(types));
                }

                return ts.visitEachChild(node, visitor, context);
            };

            return (rootNode) => ts.visitNode(rootNode, visitor) as ts.TypeNode;
        },
    ]);
    const [nextTypeNode] = result.transformed;

    result.dispose();

    return nextTypeNode;
}

function shouldStripNullishFromExportedType(name: string) {
    return /(?:Query|Mutation|Subscription|Fragment)$/.test(name);
}

function rewriteRelativeImportsForMovedFile(sourceText: string, sourcePath: string, targetPath: string) {
    const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const edits: Array<{ start: number; end: number; value: string }> = [];

    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) {
            continue;
        }

        const moduleSpecifier = statement.moduleSpecifier;

        if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier) || !moduleSpecifier.text.startsWith(".")) {
            continue;
        }

        const nextImportPath = relative(dirname(targetPath), resolveImportPath(sourcePath, moduleSpecifier.text))
            .split("\\")
            .join("/")
            .replace(/^([^./])/, "./$1");

        edits.push({
            start: moduleSpecifier.getStart(sourceFile) + 1,
            end: moduleSpecifier.getEnd() - 1,
            value: nextImportPath,
        });
    }

    let nextSourceText = sourceText;

    for (const edit of edits.sort((left, right) => right.start - left.start)) {
        nextSourceText = nextSourceText.slice(0, edit.start) + edit.value + nextSourceText.slice(edit.end);
    }

    return nextSourceText;
}

function resolveImportPath(sourcePath: string, importPath: string) {
    return new URL(importPath, `file://${sourcePath}`).pathname;
}

function pruneGeneratedSource(sourceText: string, sourcePath: string, stripNullishFromOperationTypes: boolean) {
    const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const exportedStatements = new Map<string, ts.Statement>();

    for (const statement of sourceFile.statements) {
        const exportedName = getExportedName(statement);

        if (exportedName) {
            exportedStatements.set(exportedName, statement);
        }
    }

    const knownNames = new Set(exportedStatements.keys());
    const dependenciesByName = new Map<string, Set<string>>();

    for (const [name, statement] of exportedStatements) {
        dependenciesByName.set(name, collectDependencies(statement, knownNames, name));
    }

    const queue = [...knownNames].filter((name) => name.endsWith("Document"));
    const keptNames = new Set(queue);

    while (queue.length > 0) {
        const current = queue.pop();

        if (!current) {
            continue;
        }

        for (const dependency of dependenciesByName.get(current) ?? []) {
            if (keptNames.has(dependency)) {
                continue;
            }

            keptNames.add(dependency);
            queue.push(dependency);
        }
    }

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const firstStatement = sourceFile.statements[0];

    return (
        sourceText.slice(0, firstStatement?.getFullStart() ?? 0) +
        sourceFile.statements
            .filter((statement) => {
                if (ts.isImportDeclaration(statement)) {
                    return true;
                }

                const exportedName = getExportedName(statement);
                return exportedName ? keptNames.has(exportedName) : false;
            })
            .map((statement) => {
                const exportedName = getExportedName(statement);

                if (stripNullishFromOperationTypes && exportedName && ts.isTypeAliasDeclaration(statement)) {
                    let nextStatement = statement;

                    if (shouldStripNullishFromExportedType(exportedName)) {
                        nextStatement = ts.factory.updateTypeAliasDeclaration(
                            nextStatement,
                            nextStatement.modifiers,
                            nextStatement.name,
                            nextStatement.typeParameters,
                            stripNullishFromTypeNode(nextStatement.type)
                        );
                    }

                    if (nextStatement !== statement) {
                        return printer.printNode(ts.EmitHint.Unspecified, nextStatement, sourceFile);
                    }
                }

                return sourceText.slice(statement.getFullStart(), statement.getEnd());
            })
            .join("\n\n")
    );
}

export async function pruneGeneratedTarget(target: GraphqlCodegenResolvedTarget) {
    const sourceText = await readFile(target.sourcePath, "utf8");
    let nextSourceText = pruneGeneratedSource(
        sourceText,
        target.sourcePath,
        target.stripNullishFromOperationTypes ?? true
    );

    if (target.overrides?.operationTypes?.length) {
        nextSourceText = applyOperationTypeOverridesToSource(
            nextSourceText,
            target.outputPath,
            target.overrides.operationTypes
        );
    }

    if (target.transformSource) {
        const context: GraphqlCodegenTargetTransformContext = {
            projectRoot: process.cwd(),
            targetName: target.name,
            outputPath: target.outputPath,
            tempOutputDirPath: target.tempOutputDirPath,
        };
        nextSourceText = await target.transformSource(nextSourceText, context);
    }

    nextSourceText = rewriteRelativeImportsForMovedFile(nextSourceText, target.sourcePath, target.outputPath);
    nextSourceText = nextSourceText.replace(/\bRecord</g, "globalThis.Record<");
    nextSourceText = stripLeadingEslintDisableBanner(nextSourceText);

    await mkdir(dirname(target.outputPath), { recursive: true });
    await writeFile(target.outputPath, nextSourceText);
    await rm(target.tempOutputDirPath, { recursive: true, force: true });
}
