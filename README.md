# SVAF Backend

Backend foundation for the AI tool entry.

## What it does

- `POST /auth/login`
- `GET /auth/me`
- `GET /health`

This is the first module. Future AI-related APIs can live here as well.

## Environment

Copy `.env.example` to `.env` and fill:

- `DATABASE_URL`
- `AUTH_SECRET`
- `CORS_ORIGIN`
- `MODEL_API_BASE_URL`
- `MODEL_API_KEY`
- `MODEL_MODEL`
- `MODEL_PROVIDER`
- `MODEL_API_PATH`
- `MODEL_SYSTEM_PROMPT`

If you deploy the backend on Alibaba Cloud and use GitHub Actions or a similar
pipeline, keep `DATABASE_URL` and `AUTH_SECRET` as deployment secrets. The
frontend must not read `DATABASE_URL`; it only needs the auth service URL.

If you want `/ai/chat` to call a cloud model, set `MODEL_API_BASE_URL` and
`MODEL_API_KEY` to an OpenAI-compatible endpoint. If those are missing, the
backend falls back to the built-in local reply.

## Database

Run `sql/schema.sql` in PostgreSQL first.

## Run

```bash
cd /opt/svaf-backend
pnpm install
pnpm start
```

## Create the first account

```bash
cd /opt/svaf-backend
EMAIL=admin@example.com PASSWORD='your-password' DISPLAY_NAME='Admin' ROLE=admin pnpm seed-user
```

## Create a password hash

```bash
cd /opt/svaf-backend
pnpm hash-password
```

Use the printed hash if you want to insert users manually.
