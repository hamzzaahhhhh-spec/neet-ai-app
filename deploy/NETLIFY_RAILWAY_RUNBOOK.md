# Netlify + Railway Runbook

## 1. Deploy AI Service (Railway)
- Create new service from `ai-service` folder.
- Start command:
  - `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Add variables from `deploy/railway-ai-service.env.example`.
- Deploy and note URL:
  - `https://YOUR_AI_SERVICE_DOMAIN`

## 2. Deploy Backend (Railway)
- Create new service from `backend` folder.
- Start command:
  - `npm start`
- Add PostgreSQL + Redis plugins in Railway.
- Add variables from `deploy/railway-backend.env.example`.
- Set:
  - `AI_SERVICE_URL` to your actual AI service URL from step 1.
  - `AI_SERVICE_API_KEY` and `SERVICE_API_KEY` to same value.
- Deploy and note URL:
  - `https://YOUR_BACKEND_DOMAIN`

## 3. Deploy Frontend (Netlify)
- Import repository into Netlify.
- Build settings:
  - Base directory: `frontend`
  - Build command: `npm run build`
- `netlify.toml` is already configured for Next.js plugin.
- Add environment variable from `deploy/netlify.env.example`:
  - `NEXT_PUBLIC_BACKEND_API_URL=https://YOUR_BACKEND_DOMAIN/api/v1`
- Deploy site.

## 4. Final Security Alignment
- Update backend `CORS_ORIGINS` to include:
  - Netlify URL: `https://YOUR_SITE.netlify.app`
  - Custom domain (if used): `https://yourdomain.com`
- Keep `OPENAI_API_KEY` only in Railway backend + Railway AI service.
- Never put secret keys in Netlify env vars.

## 5. Post-Deploy Checks
- Frontend opens and login works.
- `GET https://YOUR_BACKEND_DOMAIN/health` returns `ok`.
- AI health endpoint returns `ok`.
- Backend can generate daily paper once and does not duplicate runs.
