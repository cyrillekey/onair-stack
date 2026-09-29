import sdk from "stremio-addon-sdk";

/**
 * `stremio-addon-sdk` is published as CommonJS and assigns its exports via a
 * `module.exports = { ... }` object literal. Node's static named-export
 * detection only recovers a subset of those keys, so importing e.g.
 * `serveHTTP` by name throws at runtime under ESM.
 *
 * Importing the namespace once and destructuring keeps every export working
 * regardless of what the CJS lexer manages to detect.
 */
export const { addonBuilder, getRouter, publishToCentral, serveHTTP } = sdk;

export type { Manifest } from "stremio-addon-sdk";
