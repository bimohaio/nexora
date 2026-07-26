# Coding style

Public APIs declare returns and favor readonly models. Strict TypeScript is mandatory. Untrusted data is `unknown`; `any`, deep cross-package imports, circular imports, numeric persisted enums, and undocumented assertions are prohibited. Package `index.ts` files define public surfaces.
