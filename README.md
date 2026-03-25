# AOS Console

Single production surface for all AOS user types.

## Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
SUPABASE_DB_URL="your-connection-string" python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8009 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on port 3009, proxies `/api` to backend on port 8009.

## Deployment

Deployed on Render via `render.yaml`. Set environment variables in Render dashboard.
