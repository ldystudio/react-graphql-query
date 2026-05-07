import { defineGraphqlCodegenProject } from "@ldystudio/react-graphql-query/codegen";
import { mainOperationTypeOverrides, secondaryOperationTypeOverrides } from "./overrides";

const MAIN_GRAPHQL_ENDPOINT = "https://api.example.invalid/graphql";
const SECONDARY_GRAPHQL_ENDPOINT = "https://secondary-api.example.invalid/graphql";

export default defineGraphqlCodegenProject({
    targets: {
        main: {
            schema: MAIN_GRAPHQL_ENDPOINT,
            documents: ["src/service/gql/main.graphql"],
            output: "src/service/__generated__/main.ts",
            definitions: {
                output: "src/service/gql/main.gql.ts"
            },
            overrides: {
                operationTypes: mainOperationTypeOverrides
            },
            config: {
                defaultScalarType: "unknown",
                scalars: {
                    DateTime: "string",
                    JSON: "unknown"
                }
            }
        },
        secondary: {
            schema: SECONDARY_GRAPHQL_ENDPOINT,
            documents: ["src/service/gql/secondary.graphql"],
            output: "src/service/__generated__/secondary.ts",
            definitions: {
                output: "src/service/gql/secondary.gql.ts",
                client: {
                    name: "SecondaryGraphqlClient",
                    importPath: "~/service/client"
                }
            },
            overrides: {
                operationTypes: secondaryOperationTypeOverrides
            }
        }
    },
    format: {
        command: ["bunx", "biome", "check", "--write"]
    }
});
