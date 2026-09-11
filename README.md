# JULIE

Website for [JULIE](https://meetjulie.org), an assisted system for scientific
literature review.

The website is being prepared. This repository currently contains a temporary
holding page and the hosting configuration.

## Files

- `public/`: files served by the website. No build step is required.
- `.cpanel.yml`: copies `public/` into the domain's document root.

Only approved website files belong in this repository. Keep drafts, internal
research, credentials, and private configuration outside it.

## Hosting

The site uses cPanel Git Version Control with manual pull deployment.
Clone `https://github.com/ConstantinTamas/meetjulie.git` into a directory outside
the document root. Use the `main` branch.

To publish an approved update:

1. Commit the website files under `public/` and push to GitHub.
2. In cPanel, open **Git Version Control > Manage > Pull or Deploy**.
3. Click **Update from Remote**, then **Deploy HEAD Commit**.

Pushing to GitHub alone does not publish an update to the website. Deployment
copies files without deleting existing server files; removed or renamed pages
need separate cleanup. Never put secrets in `public/`.

When replacing the holding page, remove its temporary `noindex` directive from
the final homepage.

See [cPanel's deployment guide](https://docs.cpanel.net/knowledge-base/web-services/guide-to-git-set-up-deployment/).
