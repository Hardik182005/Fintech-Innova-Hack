/**
 * Test stand-in for the `server-only` marker package.
 *
 * The real package throws on import unless the bundler resolves it under the
 * `react-server` condition — that throw is exactly the build-time guard we want
 * in the app, since it turns "a Client Component imported the module holding
 * our credentials" into a failed build. Vitest does not run under that
 * condition, so the guard would stop the module under test from loading at all.
 * Aliasing it here keeps the guard in production and out of the test run.
 */
export {};
