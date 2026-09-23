# User preferences

Do not add automatic or manual enumeration prefixes to user-facing generated content, including question stems, options, solutions, headings, and document text. Use unnumbered content by default. Preserve identifiers required by a data schema in their dedicated fields without duplicating them into displayed text. Add numbering only when the user explicitly requests it.

# Publishing this repository

The GitHub remote is `Johnnyallen07/johnnyallen-blog`. Pushes to `main` trigger the existing deployment workflow in `.github/workflows/cd.yml`.

The user authorizes publishing completed changes to GitHub `main` after relevant checks pass. Unless the user explicitly asks to keep changes local, use a different branch, or stop before publishing, finish the implementation, verify it, commit the task's changes, and push to `main` without asking for the same approval again.

Fetch the latest remote state first. Preserve unrelated work, resolve relevant integration issues, and never force-push `main`. Use the existing CI/CD deployment workflow instead of performing a separate manual production deployment. Report the pushed commit and the actual deployment status; do not claim deployment succeeded just because the push succeeded.

The API Docker startup runs `prisma migrate deploy` before starting the server. Include any required database migrations in the published changes.
