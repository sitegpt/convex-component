/// <reference types="vite/client" />

import schema from './component/schema.js'

const modules = import.meta.glob('./component/**/*.ts')

type ConvexTestLike = {
  registerComponent: (name: string, schema: unknown, modules: unknown) => void
}

/**
 * Register the SiteGPT component with convex-test:
 *
 * ```ts
 * const t = convexTest(appSchema, appModules)
 * registerSiteGpt(t)
 * ```
 */
export function registerSiteGpt(t: ConvexTestLike, name = 'sitegpt') {
  t.registerComponent(name, schema, modules)
}

export { modules, schema }

export default {
  modules,
  register: registerSiteGpt,
  schema,
}
