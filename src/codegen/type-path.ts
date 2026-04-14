import ts from "typescript";

export interface TypePathSegment {
    name: string;
    isArrayElement: boolean;
}

interface RewriteContext {
    filePath: string;
    operation: string;
    path: string;
}

export function parseTypePath(path: string): TypePathSegment[] {
    if (!path) {
        throw new Error("Type override path must not be empty.");
    }

    return path.split(".").map((segment) => {
        const isArrayElement = segment.endsWith("[]");
        const name = isArrayElement ? segment.slice(0, -2) : segment;

        if (!name) {
            throw new Error(`Invalid type override path segment "${segment}" in "${path}".`);
        }

        return { name, isArrayElement };
    });
}

export function parseTypeExpression(typeExpression: string) {
    const sourceFile = ts.createSourceFile(
        "type-override.ts",
        `type __TypeOverride = ${typeExpression};`,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );
    const statement = sourceFile.statements.find(ts.isTypeAliasDeclaration);

    if (!statement) {
        throw new Error(`Failed to parse type expression "${typeExpression}".`);
    }

    return statement.type;
}

export function replaceTypeAtPath(
    typeNode: ts.TypeNode,
    pathSegments: TypePathSegment[],
    replacementTypeNode: ts.TypeNode,
    context: RewriteContext
) {
    return replaceTypeAtPathInternal(typeNode, pathSegments, replacementTypeNode, context);
}

function replaceTypeAtPathInternal(
    typeNode: ts.TypeNode,
    pathSegments: TypePathSegment[],
    replacementTypeNode: ts.TypeNode,
    context: RewriteContext
): ts.TypeNode {
    if (pathSegments.length === 0) {
        return replacementTypeNode;
    }

    return mapNullableTypeNode(typeNode, (nextTypeNode) => {
        if (!ts.isTypeLiteralNode(nextTypeNode)) {
            throw createRewriteError(context, `Expected an object type while traversing "${context.path}".`);
        }

        const [currentSegment, ...restSegments] = pathSegments;
        const property = nextTypeNode.members.find(
            (member): member is ts.PropertySignature =>
                ts.isPropertySignature(member) && getPropertyName(member.name) === currentSegment.name
        );

        if (!property?.type) {
            throw createRewriteError(
                context,
                `Property "${currentSegment.name}" was not found while traversing "${context.path}".`
            );
        }

        const rewrittenPropertyType = currentSegment.isArrayElement
            ? replaceArrayElementType(property.type, restSegments, replacementTypeNode, context)
            : replaceTypeAtPathInternal(property.type, restSegments, replacementTypeNode, context);

        return ts.factory.updateTypeLiteralNode(
            nextTypeNode,
            ts.factory.createNodeArray(
                nextTypeNode.members.map((member) => {
                    if (member !== property) {
                        return member;
                    }

                    return ts.factory.updatePropertySignature(
                        property,
                        property.modifiers,
                        property.name,
                        property.questionToken,
                        rewrittenPropertyType
                    );
                })
            )
        );
    });
}

function replaceArrayElementType(
    typeNode: ts.TypeNode,
    pathSegments: TypePathSegment[],
    replacementTypeNode: ts.TypeNode,
    context: RewriteContext
) {
    return mapNullableTypeNode(typeNode, (nextTypeNode) => {
        if (ts.isArrayTypeNode(nextTypeNode)) {
            return ts.factory.updateArrayTypeNode(
                nextTypeNode,
                replaceTypeAtPathInternal(nextTypeNode.elementType, pathSegments, replacementTypeNode, context)
            );
        }

        if (!ts.isTypeReferenceNode(nextTypeNode) || nextTypeNode.typeArguments?.length !== 1) {
            throw createRewriteError(context, `Expected an array type while traversing "${context.path}".`);
        }

        if (!isArrayTypeReference(nextTypeNode.typeName)) {
            throw createRewriteError(context, `Expected an array type while traversing "${context.path}".`);
        }

        return ts.factory.updateTypeReferenceNode(
            nextTypeNode,
            nextTypeNode.typeName,
            ts.factory.createNodeArray([
                replaceTypeAtPathInternal(nextTypeNode.typeArguments[0], pathSegments, replacementTypeNode, context),
            ])
        );
    });
}

function mapNullableTypeNode(typeNode: ts.TypeNode, mapper: (typeNode: ts.TypeNode) => ts.TypeNode) {
    if (!ts.isUnionTypeNode(typeNode)) {
        return mapper(typeNode);
    }

    const nextTypes = typeNode.types.map((member) => (isNullishTypeNode(member) ? member : mapper(member)));

    return ts.factory.updateUnionTypeNode(typeNode, ts.factory.createNodeArray(nextTypes));
}

function isNullishTypeNode(node: ts.TypeNode) {
    return (
        node.kind === ts.SyntaxKind.UndefinedKeyword ||
        (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword)
    );
}

function isArrayTypeReference(typeName: ts.EntityName) {
    return ts.isIdentifier(typeName) && (typeName.text === "Array" || typeName.text === "ReadonlyArray");
}

function getPropertyName(name: ts.PropertyName) {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }

    return undefined;
}

function createRewriteError(context: RewriteContext, reason: string) {
    return new Error(
        `[codegen-overrides] ${reason} file=${context.filePath} operation=${context.operation} path=${context.path}`
    );
}
