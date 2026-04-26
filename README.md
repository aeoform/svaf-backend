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

If you deploy the backend on Alibaba Cloud and use GitHub Actions or a similar
pipeline, keep `DATABASE_URL` and `AUTH_SECRET` as deployment secrets. The
frontend must not read `DATABASE_URL`; it only needs the auth service URL.

## Database

Run `sql/schema.sql` in PostgreSQL first.

## Run

```bash
cd /opt/svaf/backend
pnpm install
pnpm start
```

## Create a password hash

```bash
cd /opt/svaf/backend
pnpm hash-password
```

Use the printed hash in `auth_users.password_hash`.
