import type { FieldNode, OperationDefinitionNode, SelectionSetNode } from "graphql";
import { Kind, parse, print } from "graphql";
import type { RequestOptions } from "graphql-request";

export type GraphqlOperationKind = "Query" | "Mutation" | "Subscription";

function getDocumentText(document: RequestOptions["document"]) {
    return typeof document === "string" ? document : print(document as Parameters<typeof print>[0]);
}

function getFieldKey(field: FieldNode) {
    return field.alias?.value ?? field.name.value;
}

function getDirectFieldSelections(selectionSet?: SelectionSetNode) {
    return selectionSet?.selections.filter((selection): selection is FieldNode => selection.kind === Kind.FIELD) ?? [];
}

function getOperationDefinition(document: ReturnType<typeof parse>) {
    const operation = document.definitions.find(
        (definition): definition is OperationDefinitionNode => definition.kind === Kind.OPERATION_DEFINITION
    );

    if (!operation) {
        throw new Error("Failed to infer parseKey: GraphQL document does not contain an operation definition");
    }

    return operation;
}

export function inferGraphqlOperationKind(document: RequestOptions["document"]): GraphqlOperationKind {
    const parsed = parse(getDocumentText(document));
    const operation = getOperationDefinition(parsed);

    switch (operation.operation) {
        case "query":
            return "Query";
        case "mutation":
            return "Mutation";
        case "subscription":
            return "Subscription";
    }

    throw new Error(`Failed to infer operation kind: unsupported operation "${operation.operation}"`);
}

export function inferGraphParseKey(document: RequestOptions["document"]) {
    const parsed = parse(getDocumentText(document));
    const operation = getOperationDefinition(parsed);
    const rootFields = getDirectFieldSelections(operation.selectionSet);

    if (rootFields.length !== 1) {
        throw new Error("Failed to infer parseKey: GraphQL document must have exactly one top-level field");
    }

    const path = [getFieldKey(rootFields[0])];
    let currentField = rootFields[0];

    while (true) {
        const nextFields = getDirectFieldSelections(currentField.selectionSet);

        if (nextFields.length !== 1 || nextFields[0]?.selectionSet == null) {
            return path.join(".");
        }

        currentField = nextFields[0];
        path.push(getFieldKey(currentField));
    }
}
