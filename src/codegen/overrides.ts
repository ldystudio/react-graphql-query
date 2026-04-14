import ts from "typescript";
import { parseTypeExpression, parseTypePath, replaceTypeAtPath } from "./type-path";
import type { GraphqlCodegenOperationTypeOverrideRule } from "./types";

const operationTypeSuffixes = ["Query", "Mutation", "Subscription"];

function isExported(statement: ts.Statement) {
    return ts.canHaveModifiers(statement)
        ? (ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
        : false;
}

function getExportedName(statement: ts.Statement) {
    if (!isExported(statement)) {
        return undefined;
    }

    if (ts.isTypeAliasDeclaration(statement)) {
        return statement.name.text;
    }

    return undefined;
}

function getRuleKey(rule: GraphqlCodegenOperationTypeOverrideRule) {
    return `${rule.operation}::${rule.path}::${rule.type}`;
}

function applyOperationTypeOverrides(
    statement: ts.TypeAliasDeclaration,
    filePath: string,
    rules: GraphqlCodegenOperationTypeOverrideRule[],
    appliedRuleKeys: Set<string>
) {
    const operationName = statement.name.text;
    const matchedRules = rules.filter((rule) => rule.operation === operationName);

    if (matchedRules.length === 0) {
        return statement;
    }

    if (!operationTypeSuffixes.some((suffix) => operationName.endsWith(suffix))) {
        throw new Error(
            `[codegen-overrides] Rule targets non-operation type. file=${filePath} operation=${operationName}`
        );
    }

    let nextTypeNode = statement.type;

    for (const rule of matchedRules) {
        nextTypeNode = replaceTypeAtPath(nextTypeNode, parseTypePath(rule.path), parseTypeExpression(rule.type), {
            filePath,
            operation: operationName,
            path: rule.path,
        });
        appliedRuleKeys.add(getRuleKey(rule));
    }

    return ts.factory.updateTypeAliasDeclaration(
        statement,
        statement.modifiers,
        statement.name,
        statement.typeParameters,
        nextTypeNode
    );
}

export function applyOperationTypeOverridesToSource(
    sourceText: string,
    filePath: string,
    rules: GraphqlCodegenOperationTypeOverrideRule[]
) {
    if (rules.length === 0) {
        return sourceText;
    }

    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const exportedOperationNames = new Set<string>();

    for (const statement of sourceFile.statements) {
        const exportedName = getExportedName(statement);

        if (exportedName) {
            exportedOperationNames.add(exportedName);
        }
    }

    const appliedRuleKeys = new Set<string>();
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const nextSourceText =
        sourceText.slice(0, sourceFile.statements[0]?.getFullStart() ?? 0) +
        sourceFile.statements
            .map((statement) => {
                if (!ts.isTypeAliasDeclaration(statement)) {
                    return sourceText.slice(statement.getFullStart(), statement.getEnd());
                }

                const exportedName = getExportedName(statement);

                if (!exportedName) {
                    return sourceText.slice(statement.getFullStart(), statement.getEnd());
                }

                const nextStatement = applyOperationTypeOverrides(statement, filePath, rules, appliedRuleKeys);

                if (nextStatement !== statement) {
                    return printer.printNode(ts.EmitHint.Unspecified, nextStatement, sourceFile);
                }

                return sourceText.slice(statement.getFullStart(), statement.getEnd());
            })
            .join("\n\n");

    const unappliedRules = rules.filter(
        (rule) => exportedOperationNames.has(rule.operation) && !appliedRuleKeys.has(getRuleKey(rule))
    );

    if (unappliedRules.length > 0) {
        const summary = unappliedRules.map((rule) => `${rule.operation}.${rule.path} -> ${rule.type}`).join(", ");

        throw new Error(`[codegen-overrides] Unapplied override rules: ${summary}`);
    }

    return nextSourceText;
}
