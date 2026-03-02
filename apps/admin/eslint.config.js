import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
    ...nextJsConfig,
    {
        rules: {
            "react/prop-types": "off",
            "@next/next/no-img-element": "off",
            "react/no-unescaped-entities": "off",
        },
    },
];
