# Deployment Guide

## Architecture

- Frontend: Vercel/Netlify (Next.js)
- Backend: Railway/AWS/Docker
- AI Service: Railway/AWS/Docker
- PostgreSQL: Railway Postgres / AWS RDS / Docker
- Redis: Railway Redis / AWS ElastiCache / Docker

## Quick Start: Docker Compose (Full Stack)

The easiest way to deploy the entire stack locally or on a VPS:

```bash
# 1. Clone and navigate to the project
cd neet-burhan-2026

# 2. Set environment variables (create .env file or export)
export JWT_SECRET=your-super-secret-jwt-key
export AI_SERVICE_API_KEY=shared-secret-key-between-backend-and-ai
export OPENAI_API_KEY=your-openai-api-key  # Optional, for AI generation

# 3. Start all services
docker-compose up -d

# 4. Access the application
# - Frontend: http://localhost:3000 (if running separately)
# - Backend API: http://localhost:4000
# - AI Service: http://localhost:8000
# - Health Check: http://localhost:4000/health
```

### Docker Compose Services

| Service | Port | Description |
|---------|------|-------------|
| postgres | 5432 | PostgreSQL database |
| redis | 6379 | Redis cache |
| backend | 4000 | Node.js API server |
| ai-service | 8000 | Python FastAPI AI service |

## Option A: Vercel + Railway (Recommended)

### Frontend (Vercel)
1. Import `frontend` directory as project.
2. Build command: `npm run build`
3. Output: default Next.js (standalone).
4. Environment Variables:
   - `NEXT_PUBLIC_BACKEND_API_URL=https://<backend-domain>/api/v1`

### Backend (Railway)
1. Create service from `backend` directory.
2. Start command: `npm start`
3. Add Postgres + Redis plugins.
4. Migration is auto-run at backend startup (`node scripts/run-migrations.js && node src/server.js`).
   Optional manual run:
   ```bash
   railway run npm run migrate
   ```
5. Environment Variables:
   - `PORT` (Railway provides this)
   - `NODE_ENV=production`
   - `DATABASE_URL` (from Railway Postgres)
   - `REDIS_URL` (from Railway Redis)
   - `JWT_SECRET` (generate a strong secret)
   - `AI_SERVICE_URL=https://<ai-service-domain>`
   - `AI_SERVICE_API_KEY=<shared-key>`
   - `CORS_ORIGINS=https://<your-frontend-domain>`
   - `PREDICTION_MODE_ENABLED=false`
   - `INACTIVITY_LIMIT_MINUTES=15`
   - `BIOLOGY_TOPICS_JSON=<exact official list>`

### AI Service (Railway)
1. Create Python service from `ai-service` directory.
2. Start command:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
3. Environment Variables:
   - `PORT` (Railway provides this)
   - `SERVICE_API_KEY=<same-shared-key>`
   - `OPENAI_API_KEY=<optional for LLM generation>`
   - `OPENAI_MODEL=gpt-4o-mini`
   - `CONFIDENCE_THRESHOLD=0.75`
   - `BIOLOGY_TOPICS_JSON=<exact official list>`

## Option B: Netlify + Railway

### Frontend (Netlify)
1. Connect your repository to Netlify.
2. Netlify automatically detects `netlify.toml` in the root.
3. Ensure **Base directory** is set to `frontend`.
4. Set Environment Variables in Netlify Site Settings:
   - `NEXT_PUBLIC_BACKEND_API_URL`: URL of your deployed backend.
5. Deploy.

*Note: You must still deploy the Backend and AI Service (see Option A) for the app to function.*

## Option C: AWS (Production Scale)

### Frontend
- Deploy `frontend` to Vercel, Netlify, or AWS Amplify.

### Backend + AI Service (ECS Fargate)
1. Build and push Docker images:
   ```bash
   # Backend
   cd backend
   docker build -t your-registry/neet-backend:latest .
   docker push your-registry/neet-backend:latest
   
   # AI Service
   cd ../ai-service
   docker build -t your-registry/neet-ai-service:latest .
   docker push your-registry/neet-ai-service:latest
   ```

2. Deploy on ECS Fargate with Application Load Balancer.

3. Use RDS PostgreSQL and ElastiCache Redis.

4. Store environment variables in AWS Secrets Manager.

5. Attach CloudWatch logs and alarms.

### Infrastructure as Code (CloudFormation/Terraform)

Example ECS task definition for backend:
```json
{
  "family": "neet-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "your-registry/neet-backend:latest",
      "portMappings": [
        {
          "containerPort": 4000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:..."
        }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "node -e \"require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\""],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

## Option D: VPS with Docker Compose

For a single-server deployment:

1. Provision a VPS (DigitalOcean, Linode, AWS EC2, etc.) with at least 2GB RAM.

2. Install Docker and Docker Compose:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

3. Clone the repository and create environment file:
   ```bash
   git clone <your-repo>
   cd neet-burhan-2026
   ```

4. Create `.env` file:
   ```bash
   JWT_SECRET=your-super-secret-jwt-key-min-32-chars
   AI_SERVICE_API_KEY=shared-secret-key-backend-ai
   OPENAI_API_KEY=sk-...  # Optional
   ADMIN_BOOTSTRAP_EMAIL=admin@example.com
   ADMIN_BOOTSTRAP_PASSWORD=secure-admin-password
   ```

5. Start services:
   ```bash
   docker-compose up -d
   ```

6. Run migrations:
   ```bash
   docker-compose exec backend npm run migrate
   ```

7. Setup Nginx reverse proxy (optional but recommended):
   - Use provided `nginx.conf` as template
   - Install certbot for SSL certificates

8. Configure firewall:
   ```bash
   sudo ufw allow 22
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw enable
   ```

## Security Hardening Checklist

- [ ] Rotate `JWT_SECRET` and AI shared API key (use strong, random values)
- [ ] Restrict CORS to production domain only
- [ ] Enforce HTTPS at load balancer/proxy
- [ ] Enable DB backups and Redis persistence
- [ ] Keep `OPENAI_API_KEY` server-side only
- [ ] Add WAF/rate controls at edge (Cloudflare/AWS WAF)
- [ ] Use non-root users in Docker containers (already configured)
- [ ] Enable Docker health checks (already configured)
- [ ] Set up log aggregation and monitoring
- [ ] Configure automated security updates

## Environment Variables Reference

### Backend
| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | Server port (Railway provides this) |
| `NODE_ENV` | Yes | `production` or `development` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing (min 32 chars) |
| `JWT_EXPIRES_IN` | No | JWT expiration (default: 7d) |
| `AI_SERVICE_URL` | Yes | URL of AI service |
| `AI_SERVICE_API_KEY` | Yes | Shared secret for AI service auth |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins |
| `ADMIN_BOOTSTRAP_EMAIL` | No | Initial admin email |
| `ADMIN_BOOTSTRAP_PASSWORD` | No | Initial admin password |
| `PREDICTION_MODE_ENABLED` | No | Enable prediction features (default: false) |
| `INACTIVITY_LIMIT_MINUTES` | No | Auto-submit after inactivity (default: 15) |
| `BIOLOGY_TOPICS_JSON` | No | JSON array of official biology topics |

### AI Service
| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | Server port (Railway provides this) |
| `APP_ENV` | No | `production` or `development` |
| `SERVICE_API_KEY` | Yes | Shared secret for backend auth |
| `OPENAI_API_KEY` | No | OpenAI API key for generation |
| `OPENAI_MODEL` | No | Model name (default: gpt-4o-mini) |
| `CONFIDENCE_THRESHOLD` | No | Minimum confidence score (default: 0.75) |
| `BIOLOGY_TOPICS_JSON` | No | JSON array of official biology topics |

### Frontend
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_BACKEND_API_URL` | Yes | Backend API URL |

## Cron Reliability

The backend runs node-cron internally for daily paper generation. For production reliability:

**Option 1: Single Instance (Simple)**
- Run one backend instance (cron runs there)

**Option 2: Dedicated Scheduler (Recommended)**
- Keep one backend instance with `DISABLE_CRON=false` (default)
- Other instances: set `DISABLE_CRON=true`
- Or use external scheduler (Railway cron / AWS EventBridge) calling `POST /api/v1/admin/paper/regenerate`

## Monitoring & Health Checks

All services expose health endpoints:

- Backend: `GET /health`
- AI Service: `GET /health`

Docker health checks are configured and will restart unhealthy containers automatically.

## Troubleshooting

### Services won't start
```bash
# Check logs
docker-compose logs -f backend
docker-compose logs -f ai-service

# Check environment variables
docker-compose exec backend env
```

### Database connection issues
```bash
# Test database connection
docker-compose exec backend node -e "const {pool} = require('./src/db/postgres.js'); pool.query('SELECT 1').then(() => console.log('OK')).catch(e => console.error(e))"
```

### Migration failures
```bash
# Run migrations manually
docker-compose exec backend npm run migrate
```

### Clear Redis cache
```bash
docker-compose exec redis redis-cli FLUSHDB
