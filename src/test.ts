import schema from './component/schema.js'

/**
 * Static module map for convex-test. Deliberately NOT import.meta.glob: that
 * is a Vite compile-time macro which would survive into the published build
 * untransformed (and would match nothing in dist, where sources are .js), so
 * the helper would silently register an empty component. A static map is
 * bundler-independent and tsc-verified; add new component modules here.
 */
export const modules: Record<string, () => Promise<unknown>> = {
  './_generated/api.js': () => import('./component/_generated/api.js'),
  './_generated/component.js': () => import('./component/_generated/component.js'),
  './_generated/dataModel.js': () => import('./component/_generated/dataModel.js'),
  './_generated/server.js': () => import('./component/_generated/server.js'),
  './account.js': () => import('./component/account.js'),
  './chat.js': () => import('./component/chat.js'),
  './conversations.js': () => import('./component/conversations.js'),
  './convex.config.js': () => import('./component/convex.config.js'),
  './knowledge.js': () => import('./component/knowledge.js'),
  './leads.js': () => import('./component/leads.js'),
  './lib/encoding.js': () => import('./component/lib/encoding.js'),
  './lib/http.js': () => import('./component/lib/http.js'),
  './schema.js': () => import('./component/schema.js'),
  './sync.js': () => import('./component/sync.js'),
}

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

export { schema }

export default {
  modules,
  register: registerSiteGpt,
  schema,
}
