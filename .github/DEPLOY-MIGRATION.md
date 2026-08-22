# Moving the planner from branch-deploy to gated deploy

**Status: PREPARED, NOT ENABLED.** Nothing here happens until Joey explicitly
approves the production change. `ci.yml` runs the gates only; publishing is
untouched.

## Current state (recorded 2026-08-22)

| | |
|---|---|
| Pages source | **Branch** - GitHub's built-in "pages build and deployment" publishes the repo root on every push to `main` |
| Evidence | deployments API: 80 runs, every one named "pages build and deployment", no repo-owned workflow has ever deployed |
| Custom domain | `gen2planner.jerrari3d.com`, set by the `CNAME` file at the repo root |
| Gate before publish | **none** - the planner had no CI of any kind until `ci.yml` |
| Published tree | the whole checkout. **Measured live 2026-08-22:** `https://gen2planner.jerrari3d.com/test/planner.test.mjs` and `/package.json` both return 200. Harmless, but not intended, and the staged deploy fixes it |

The same pattern shipped the viewer's production site for weeks with
local-only protections. The difference now is that `ci.yml` makes a failing
gate a loud red mark on every push - it just does not *stop* the branch deploy.

## Why not just merge a deploying workflow

If a workflow containing `actions/deploy-pages` lands while the Pages source
is still "branch", **both publish**. The branch build and the workflow race,
the later one wins, and a failing gate in the workflow does nothing because
the branch build does not know the workflow exists. Switching the source is a
repository-settings change, not a commit, so it cannot be done by a PR and
must not be done by accident.

## The cutover, when approved

1. Repository → Settings → Pages → **Source: GitHub Actions**. This stops the
   branch build immediately; nothing publishes until a workflow does.
2. Add the deploy job to `ci.yml` (prepared below), `needs: gates`, so a
   failing gate genuinely blocks publishing.
3. Push. Watch the run: gates → stage → upload → deploy.
4. Smoke-test (list below). The custom domain comes from the `CNAME` file,
   which is staged into the artifact, so it should carry over - **verify it**,
   because a missing CNAME in the artifact silently reverts to the github.io
   address and breaks every printed link.

### Prepared deploy job

```yaml
  deploy:
    needs: gates
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    permissions:
      contents: read
      pages: write
      id-token: write
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Upload a CLEAN copy, not the checkout: no node_modules, tests, tools,
      # or the sync receipt. git knows exactly which files are the site.
      - name: Stage the site files only
        run: |
          mkdir -p /tmp/site
          git ls-files -z | grep -zvE '^(test/|tools/|data/requirement-scope\.sync\.json|package(-lock)?\.json|\.github/|\.gitattributes|\.gitignore)' \
            | xargs -0 -I{} cp --parents {} /tmp/site/
          test -f /tmp/site/index.html || { echo "::error::index.html missing"; exit 1; }
          test -f /tmp/site/CNAME      || { echo "::error::CNAME missing - the custom domain would be lost"; exit 1; }
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: /tmp/site
      - id: deployment
        uses: actions/deploy-pages@v4
```

Staging was simulated locally 2026-08-22: 512 of 521 tracked files, `CNAME`
and `index.html` present, tests/tools/receipt excluded.

## Rollback

Settings → Pages → **Source: Deploy from a branch**, `main`, `/ (root)`.
The built-in branch build resumes on the next push (or re-run the last
"pages build and deployment" from the Actions tab). Nothing in the repo needs
to change; the `CNAME` file is still there. This is a one-click revert and it
should be tried once, deliberately, so it is known to work before it is needed.

## Smoke test on the first authorized run

Watch every job, then on the live site:

- [ ] `https://gen2planner.jerrari3d.com/` loads, not the github.io address
- [ ] HTTPS, no certificate warning (the custom domain re-provisions a cert on source change)
- [ ] Pick mount → length → place a unit → the BOM renders with thumbnails (`img/parts/`)
- [ ] A share link round-trips: copy, open in a fresh tab, same build
- [ ] "3D assembly instructions" opens the viewer and the layout relay arrives
- [ ] Faceplate / handle / back cover / feet toggles relay to the docked viewer
- [ ] `favicon.svg`, `apple-touch-icon.png`, and the hero image all 200
- [ ] The footer CHANGELOG link resolves
- [ ] GoatCounter beacon fires (`jerrari.goatcounter.com`), check the dashboard for the hit
- [ ] `curl -sI https://gen2planner.jerrari3d.com/test/` is a 404 - internal files are not served

Anything on this list failing → rollback first, diagnose second.
