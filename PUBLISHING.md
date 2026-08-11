# Publishing

The release flow has three layers of protection:

1. **No stored npm token.** CI authenticates with trusted publishing
   (OIDC): npm verifies the workflow's identity and mints a short-lived
   credential per run.
2. **Staged publishing.** CI never publishes directly. Each release lands
   in npm's staging area; a maintainer inspects it and approves with 2FA
   before the version becomes installable.
3. **Provenance.** Each release is publicly linked to the exact commit and
   workflow run that built it.

## First publish (one time, local)

Staged publishing and trusted publishing both need the package to already
exist on the registry. So the first version is published from a
maintainer's machine:

```bash
npm run typecheck && npm test && npm run build && npm pack --dry-run
npm publish --access public        # prompts for 2FA
```

## One-time setup after the first publish

1. On npmjs.com, open the package → Settings → Trusted Publisher.
2. Add a GitHub Actions publisher: organization `sitegpt`, repository
   `convex-component`, workflow `publish.yml`.
3. If the settings offer permission granularity, restrict the trust
   relationship to stage-publish only (`--allow-stage-publish`). Then a
   compromised workflow cannot bypass the staging gate.
4. Set the package to require 2FA for publish/approve.

## Cutting a release

```bash
npm run release        # patch bump + tag + push (preversion gate runs typecheck/test/build)
```

or for a pre-release:

```bash
npm run alpha          # 0.x.y-alpha.n, staged under the alpha dist-tag
```

Pushing the `v*.*.*` tag triggers `.github/workflows/publish.yml`, which
re-runs the full gate (typecheck, tests, build, pack) and then runs
`npm stage publish`. Nothing is live yet at that point.

## Approving a staged release

```bash
npm stage list @sitegpt/convex     # find the stage id
npm stage view <stage-id>          # inspect metadata
npm stage download <stage-id>      # optional: inspect the exact tarball
npm stage approve <stage-id>       # 2FA prompt; version goes live
```

Or use the Staged Packages tab on npmjs.com and click Approve. Reject a
bad stage with `npm stage reject <stage-id>`.

Requirements: npm CLI >= 11.15 and Node >= 22.14 (the workflow installs
npm@latest for this reason; use the same locally).

For a minor/major bump, run `npm version minor|major` manually and
`git push --follow-tags`.

## Checklist before the first public release

- [ ] Repo flipped to public (the components directory requires it)
- [ ] `v0.1.0` published locally with `npm publish --access public`
- [ ] Trusted publisher configured on npmjs.com (see above)
- [ ] README badge resolves after the first publish
