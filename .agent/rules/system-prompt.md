---
trigger: always_on
---

## Project Core

**Multi-category Platform** (Gaming, Music, Tech, Education).

* **Frontend**: Next.js (App Router), Tailwind CSS.
* **Backend**: NestJS (DDD/Modular), Prisma 5.22.0, PostgreSQL.
* **Database**: PostgreSQL with Prisma ORM.
* **Infrastructure**: Cloudflare R2 (S3-compatible).


---

## 🛠️ Mandatory Development Rules

### 1. Code Quality & Linting

* **Zero-Tolerance Linting**: After every file generation or modification, you must run `pnpm run lint` and `pnpm run build`. Do not consider a task "Done" if linting errors persist.
* **Type Integrity**: No `any` types. Use strict TypeScript. Export shared types/DTOs from the backend to be consumed by the frontend.
* **Stability**: Always use the most stable version of packages instead of the latest.

### 2. Architectural Integrity

* **Framework Idioms**: Always follow the "Official Best Practices" for each tool:
* **Modular Backend**: Every domain (Auth, Media, Posts) must be its own NestJS module. Logic stays in Services; Controllers only handle routing.
* **Prisma Patterns**: Run `npx prisma generate` before implementing Service logic to ensure type safety. Use migrations for all schema changes. Every model must include `createdAt`, `updatedAt`, and proper indexing on `slug` and `category`. Run npx prisma validate immediately after changes to catch relation errors.

### 3. Media & Storage Logic

* **Cloudflare R2**: Never store binary data in the DB. Use the NestJS `MediaModule` to generate **S3 Presigned URLs** for client-side uploads to Cloudflare R2.
* **Optimization**: All image components must use `next/image` with specific `remotePatterns` configured for the R2 bucket.

### 4. SEO & Metadata

* **Dynamic SEO**: Every page template must implement `generateMetadata`. Posts must include OpenGraph tags for category-specific preview images.

### 5. Language & UI/UX:

* Always use **Chinese** for every text, content of elements in the website. 
* Always follow the best practice when ask building for UI/UX, use any additional package to match the Figma design if given