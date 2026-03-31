# Opdracht Livio Backend

Express.js REST API for the Zorg met de Schijf van Vijf project.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Configure `.env` with database connection (see SETUP.md for full details)

3. Run:
```bash
npm run dev
```

Backend will be available at `http://localhost:3000`

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/client/dashboard` | Client dashboard (points, streak, tasks) |
| GET | `/api/client/tasks` | Get client tasks |
| POST | `/api/client/tasks/:id/complete` | Complete a task |
| GET | `/api/client/rewards` | Get available rewards |
| GET | `/api/family/clients` | Get linked clients |
| GET | `/api/family/clients/:id` | Get client profile |
| GET | `/api/family/clients/:id/tasks` | Get client task history |
| GET | `/api/admin/clients` | Get all clients |
| PUT | `/api/admin/clients/:id` | Update client |
| GET | `/api/admin/tasks` | Get all tasks |
| POST | `/api/admin/tasks` | Create task |
| GET | `/api/admin/rewards` | Get all rewards |
| POST | `/api/admin/rewards` | Create reward |

## Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{ "message": "Backend is running" }
```

## Full Setup

See [SETUP.md](../SETUP.md) for complete setup instructions including:
- Database configuration
- Environment variables
- Testing endpoints
- Troubleshooting
