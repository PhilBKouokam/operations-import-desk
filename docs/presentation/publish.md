# Publish this inspected release

Publication is pending. The connected GitHub tools can modify existing repositories but cannot create the requested new repository. No authenticated GitHub CLI is available in the execution environment. The website source was available, but its unchanged package/lock state failed `npm ci`; no website changes were published. Use the approved GitHub Markdown fallback. No new article platform is needed.

## Minimal manual commands

Install Git and GitHub CLI if needed. Download `operations-import-desk-public.bundle`, open a terminal in its directory, then:

```sh
git clone operations-import-desk-public.bundle operations-import-desk
cd operations-import-desk
git remote remove origin
gh auth login
gh repo create PhilBKouokam/operations-import-desk --public --source=. --remote=origin --push --description "Production-style React/NestJS import workflow demonstrating durable background processing, OIDC authorization, recovery, and handoff practices."
```

Removing `origin` removes only the local bundle path created by `git clone`; the publish command then sets the real GitHub origin.

`gh auth login` is unnecessary if already authenticated as PhilBKouokam. If a repository of this name already exists, stop and inspect it; do not force-push or overwrite it. The original M5 bundle is not the public release bundle: use this hygiene-reviewed snapshot.

After successful creation, these will be the expected URLs (not claimed live before publication):

- Project: `https://github.com/PhilBKouokam/operations-import-desk`
- Article: `https://github.com/PhilBKouokam/operations-import-desk/blob/main/docs/article.md`
- Walkthrough video: `https://github.com/PhilBKouokam/operations-import-desk/blob/main/docs/presentation/walkthrough.mp4`
- Recording package: `https://github.com/PhilBKouokam/operations-import-desk/blob/main/docs/demo-walkthrough.md`

## Verify the public result

```sh
gh repo view PhilBKouokam/operations-import-desk --json url,visibility,defaultBranchRef
gh browse --repo PhilBKouokam/operations-import-desk
```

Open the project in a signed-out/private browser window. Check the README screenshot and article/walkthrough links; open `docs/architecture.md` to check GitHub's Mermaid rendering. Confirm the video opens/downloads. Follow the two public source links in the article. Do not call remote rendering passed just because the local files validate.

The workflow may start on push. Observe the actual run before claiming hosted CI passed. Docker Compose startup remains OPEN / UNPASSED regardless of the native CI outcome. The application itself is not publicly deployed.

No outreach is sent by these commands. The Ivan draft should only use the expected URLs after they resolve publicly.
