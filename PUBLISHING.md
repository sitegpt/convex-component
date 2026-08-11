# Publishing

Releases are cut by version tag; CI publishes to npm.

## One-time setup

1. Create an npm automation token for the `@sitegpt` scope with publish rights.
2. Add it to this repo as the `NPM_TOKEN` Actions secret.

## Cutting a release

```bash
npm run release        # patch bump + tag + push (preversion gate runs typecheck/test/build)
```

or for a pre-release:

```bash
npm run alpha          # 0.x.y-alpha.n, published under the alpha dist-tag
```

Pushing the `v*.*.*` tag triggers `.github/workflows/publish.yml`, which
re-runs the full gate (typecheck, tests, build, pack) and then
`npm publish --access public`.

For a minor/major bump, run `npm version minor|major` manually and
`git push --follow-tags`.

## Checklist before the first public release

- [ ] Repo flipped to public (the components directory requires it)
- [ ] `NPM_TOKEN` secret configured
- [ ] README badge resolves after the first publish
- [ ] Tag `v0.1.0` pushed
