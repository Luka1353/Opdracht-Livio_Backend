# Zorg met de Schijf van Vijf - Setup Guide

## Backend Setup

### Prerequisites
- Node.js 16+ installed
- SQL Server database already created with the schema

### Installation

1. Navigate to the backend folder:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Update the `.env` file with your database details (already configured with your connection string)

4. Start the development server:
```bash
npm run dev
```

The backend will run on `http://localhost:3000`

### API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user

#### Client Endpoints
- `GET /api/client/dashboard` - Get client dashboard data
- `GET /api/client/tasks` - Get client tasks
- `POST /api/client/tasks/:taskId/complete` - Complete a task
- `GET /api/client/rewards` - Get available rewards

#### Family Endpoints
- `GET /api/family/clients` - Get linked clients
- `GET /api/family/clients/:clientId` - Get client profile
- `GET /api/family/clients/:clientId/tasks` - Get client tasks

#### Admin Endpoints
- `GET /api/admin/clients` - Get all clients
- `PUT /api/admin/clients/:clientId` - Update client info
- `GET /api/admin/tasks` - Get all tasks
- `POST /api/admin/tasks` - Create new task
- `GET /api/admin/rewards` - Get all rewards
- `POST /api/admin/rewards` - Create new reward

---

## Flutter App Setup

### Prerequisites
- Flutter SDK 3.11.0+
- Android SDK / iOS development tools

### Installation

1. Navigate to the app folder:
```bash
cd Opdracht-Livio
```

2. Install dependencies:
```bash
flutter pub get
```

3. **Update API Base URL** in `lib/services/api_client.dart`:
```dart
static const String baseUrl = 'http://YOUR_BACKEND_IP:3000/api';
```

Replace `YOUR_BACKEND_IP` with the actual IP address or hostname of your backend server.

4. Run the app:
```bash
flutter run
```

---

## Quick Test

### 1. Test Backend Connection
```bash
curl http://localhost:3000/health
```
Should return: `{"message":"Backend is running"}`

### 2. Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "fullName": "Test User",
    "role": "client"
  }'
```

### 3. Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

---

## Database Notes

- All tables use UNIQUEIDENTIFIER (UUID) for primary keys
- Passwords are hashed with bcryptjs
- JWT tokens are used for authentication
- Refresh tokens are stored as SHA-256 hashes for security
- All timestamps are in UTC

---

## Troubleshooting

### Backend won't connect to database
- Check the connection string in `.env`
- Verify SQL Server is running and accessible
- Ensure the database schema has been created with `database/schema.sql`

### Flutter app can't reach backend
- Make sure backend is running on port 3000
- Check firewall settings
- Update API base URL in `api_client.dart`
- Use `localhost` if running on the same machine, or the actual IP for remote access

### CORS errors
- The backend has CORS enabled, but check if any firewalls are blocking requests

---

## Next Steps

1. Run the database schema: `database/schema.sql` in SQL Server Management Studio
2. Start the Node.js backend: `npm run dev`
3. Update the API URL in the Flutter app
4. Run Flutter app: `flutter run`
5. Test with login/register

Good luck! 🚀
