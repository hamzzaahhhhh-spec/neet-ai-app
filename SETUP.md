# Local Setup

## 1. Infrastructure

1. Start PostgreSQL and Redis:
```powershell
docker compose up -d
```

## 2. Backend

1. Copy env:
```powershell
Copy-Item backend/.env.example backend/.env
```
2. Install dependencies:
```powershell
cd backend
npm install
```
3. Run migration:
```powershell
npm run migrate
```
4. Start backend:
```powershell
npm run dev
```

## 3. AI Service

1. Create virtualenv and install:
```powershell
cd ..\ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```
2. Copy env:
```powershell
Copy-Item .env.example .env
```
3. Run service:
```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 4. Frontend

1. Copy env:
```powershell
cd ..\frontend
Copy-Item .env.example .env.local
```
2. Install and run:
```powershell
npm install
npm run dev
```

## 5. Access

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/health`
- AI health: `http://localhost:8000/health`

## 6. Admin bootstrap

Set `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` in `backend/.env`, restart backend, then login using those credentials.

## 7. Daily generation schedule

- Cron expression: `1 0 * * *`
- Timezone: `Asia/Kolkata`
- Trigger time: `00:01 IST`

## 8. Manual regenerate (admin)

- API: `POST /api/v1/admin/paper/regenerate`
- Body: `{ "date": "YYYY-MM-DD" }` (optional, defaults to today IST)

## 9. New analytics endpoints

- Admin analytics: `GET /api/v1/admin/analytics`
- Admin leaderboard: `GET /api/v1/admin/leaderboard?period=daily|weekly`
- Student leaderboard: `GET /api/v1/leaderboard/daily`, `GET /api/v1/leaderboard/weekly`
- Revision queue: `GET /api/v1/attempts/revision-queue`

## 10. Frontend adaptive persistence

- Session autosave interval: every 10 seconds (`localStorage`).
- Performance history and adaptive model are stored in localStorage and auto-restored.
