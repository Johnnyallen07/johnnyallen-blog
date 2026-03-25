import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
    ...nextJsConfig,
    {
        rules: {
            "react/prop-types": "off",
            "@next/next/no-page-custom-font": "off",
        },
    },
];
