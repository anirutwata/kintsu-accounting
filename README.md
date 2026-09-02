This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Slip OCR configuration

The server-side `/api/ocr` route uses Gemini first and Anthropic only as the final fallback. Do not prefix API keys with `NEXT_PUBLIC_`.

```dotenv
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
OCR_SESSION_SIGNING_SECRET=
OCR_PRIMARY_MODEL=gemini-3.5-flash-lite
OCR_SECONDARY_MODEL=gemini-2.5-flash
OCR_FINAL_MODEL=claude-sonnet-4-6
OCR_FINAL_FALLBACK_ENABLED=true
OCR_SCHEMA_VERSION=1
OCR_MAX_IMAGE_BYTES=10485760
OCR_PROVIDER_TIMEOUT_MS=20000
OCR_ACTOR_RATE_LIMIT=10
OCR_GLOBAL_RATE_LIMIT=50
```

Apply `supabase/migrations/053_ocr_provider_layer.sql` before enabling this route in a preview or staging deployment. The migration must not be applied automatically by the application.

Migration 053 is additive and has no automatic down migration. To recover, roll the application back first and leave the added nullable columns and telemetry table in place; processing claims older than ten minutes are marked failed on the next claim. Do not drop the RPC, table, indexes, or columns while the OCR provider route is running. Existing signed-in users must sign in again once after this phase is enabled so the server can issue the signed OCR session cookie.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
