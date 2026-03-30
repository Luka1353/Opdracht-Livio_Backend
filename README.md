# Opdracht Livio Backend

Backend API for the Zorg met de Schijf van Vijf project.

## Requirements

- Node.js 18+
- npm
- A SQL Server database

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root with:

```env
PORT=3000

DATABASE_HOST=your-sql-server-host
DATABASE_NAME=your-database-name
DATABASE_USER=your-username
DATABASE_PASSWORD=your-password
DATABASE_ENCRYPT=true
DATABASE_TRUST_CERT=false
DATABASE_POOL_SIZE=10

JWT_ACCESS_SECRET=replace-with-a-strong-secret
JWT_REFRESH_SECRET=replace-with-a-strong-secret
```

3. Make sure your database schema is created before starting the API.

## Run

Development mode (with auto-reload):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## Health Check

When the server is running, check:

```text
GET http://localhost:3000/health
```

Expected response:

```json
{ "message": "Backend is running" }
```
