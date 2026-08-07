import { describe, expect, it } from 'vitest'

import helper, { modules, registerSiteGpt, schema } from '../src/test.js'

// What the source tree actually contains, discovered independently of the
// helper's static map. If a new component module is added without updating
// src/test.ts, this suite fails.
const globbed = import.meta.glob('../src/component/**/*.ts')

function normalizeGlobKey(key: string): string {
  return key.replace('../src/component/', './').replace(/\.ts$/u, '')
}

function normalizeHelperKey(key: string): string {
  return key.replace(/\.js$/u, '')
}

describe('test helper', () => {
  it('covers every component module in the source tree', () => {
    const fromGlob = Object.keys(globbed).map(normalizeGlobKey).sort()
    const fromHelper = Object.keys(modules).map(normalizeHelperKey).sort()
    expect(fromHelper).toEqual(fromGlob)
  })

  it('resolves every module lazily (no dead import paths)', async () => {
    for (const [key, load] of Object.entries(modules)) {
      const mod = await load()
      expect(mod, `module ${key} should load`).toBeTruthy()
    }
  })

  it('includes the _generated files convex-test needs for root detection', () => {
    expect(Object.keys(modules).some((k) => k.includes('_generated'))).toBe(true)
  })

  it('registers under the default component name', () => {
    const registered: { name: string; schema: unknown; modules: unknown }[] = []
    const fakeT = {
      registerComponent: (name: string, s: unknown, m: unknown) => {
        registered.push({ name, schema: s, modules: m })
      },
    }
    registerSiteGpt(fakeT)
    expect(registered).toEqual([{ name: 'sitegpt', schema, modules }])
    expect(helper.register).toBe(registerSiteGpt)
  })
})
