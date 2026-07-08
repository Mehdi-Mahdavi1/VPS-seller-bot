# Virtual Server Rental Telegram Bot

Production-ready Telegram bot scaffold for virtual server rentals with Infomaniak integration.

## Features

- Telegram bot built with grammY
- PostgreSQL database using Prisma ORM
- Clean architecture with service/repository layers
- Abstract datacenter provider interface for future expansion
- Wallet management, payment review, hourly billing cron
- Modular structure for maintainability

## Setup

1. Copy `.env.example` to `.env`
2. Fill in `BOT_TOKEN`, `INFOMANIAK_AUTH_TOKEN`, and `DATABASE_URL`
3. Install dependencies: `npm install`
4. Generate Prisma client: `npm run prisma:generate`
5. Run migrations: `npm run prisma:migrate`
6. Start bot: `npm run dev`

## Docker

Run with:

```bash
docker-compose up --build
```
