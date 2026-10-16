<div align="center">

# MEI de Saquá — API

**REST API for the MEI de Saquá portal, which promotes micro-entrepreneurs (MEIs) of Saquarema, Brazil.**

🇧🇷 [Leia em português](README.pt-BR.md)

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white) ![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![Sequelize](https://img.shields.io/badge/Sequelize-6-52B0E7?logo=sequelize&logoColor=white) ![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white) ![Vitest](https://img.shields.io/badge/Vitest-tested-6E9F18?logo=vitest&logoColor=white)

</div>

## About

Backend of a public portal built for the City of Saquarema. Business owners create an account, register their establishment and wait for admin approval; visitors browse by category, search and leave reviews. Admins moderate listings and comments, manage courses offered to MEIs and receive scheduled campaign reports by e-mail.

The web client lives in [MeideSaqua-Front](https://github.com/vallevinicius/MeideSaqua-Front).

## Features

- Sign-up with e-mail confirmation, login, refresh and logout, password reset and e-mail change
- Establishment registration with image upload (compressed with `sharp`) and admin approval flow
- Reviews, courses and search by category
- Separate admin authentication with its own secret and session length
- Scheduled campaign report sent by e-mail (`node-cron`)

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js, Express 5, TypeScript |
| Data | MySQL + Sequelize |
| Auth | JWT (HS256) in httpOnly cookie or `Authorization` header, `bcryptjs` |
| Hardening | `helmet`, `express-rate-limit`, CORS allowlist |
| Files | `multer` + `sharp` |
| Jobs / mail | `node-cron`, Nodemailer |
| Tests | Vitest + Supertest, `node:test` |

## Architecture

Layered MVC: `routes → controllers → services → entities (Sequelize models)`.
```
src/
  routes/        auth, users, establishments, reviews, courses, files, admin
  controllers/   HTTP layer: parse request, call service, map errors
  services/      business rules
  entities/      Sequelize models
  middlewares/   auth, admin auth, rate limiting
  schedulers/    cron jobs (campaign report)
  serializers/   response shaping (no internal fields leak)
  config/        DB connection and idempotent column migrations
```
All routes are mounted under `/api` (`/api/auth`, `/api/estabelecimentos`, `/api/avaliacoes`, `/api/cursos`, `/api/files`, `/api/users`, `/api/admin`).

## Security

- JWT verified with a pinned algorithm (`HS256`) and a per-user `tokenVersion`, so logout or password change revokes existing tokens
- Cookie-based requests that change state must come from an allowed origin (CSRF protection)
- Global and per-route rate limiting, `helmet` headers, CORS restricted to `CORS_ORIGINS`
- Proxy-aware client IP (`TRUST_PROXY_HOPS`)

## Getting started

**Prerequisites:** Node.js 20+, MySQL 8

```bash
npm install
# create a .env file with the variables below (it is git-ignored)
npm run dev        # http://localhost:3000 (or PORT)
```
Tables are created/updated on startup; new columns are added by idempotent migrations in `src/config/migracoes.ts`.

### Environment variables

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD` | MySQL connection |
| `JWT_SECRET` | Secret for user tokens |
| `ADMIN_USER / ADMIN_PASSWORD / ADMIN_JWT_SECRET / ADMIN_SESSION_HOURS` | Admin credentials, token secret and session length |
| `CORS_ORIGINS / FRONTEND_URL / APP_URL` | Allowed origins and URLs used in e-mails |
| `COOKIE_DOMAIN / COOKIE_SECURE / COOKIE_SAMESITE` | Session cookie attributes |
| `TRUST_PROXY_HOPS` | Reverse proxies in front of the API |
| `MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS` | SMTP for transactional e-mails |
| `CAMPAIGN_REPORT_CRON / CAMPAIGN_REPORT_EMAIL / RELATORIO_ANZOL_EMAIL` | Schedule and recipients of the campaign reports |

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run build && npm start` | Compile to `dist/` and run |
| `npm test` | Vitest suite + `node:test` suite |

## Testing

21 test files (Vitest + Supertest and `node:test`) covering auth and sessions, establishments, reviews, courses, secure file upload, e-mail, serializers, migrations and admin reports. Run `npm test`.

## Team

- [Vinícius Diller](https://github.com/viniciusdiller)
- [Vinicius do Valle](https://github.com/vallevinicius)
- Micael Robert
