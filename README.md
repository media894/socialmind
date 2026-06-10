# SocialMind 🎬⚡

> AI-powered social media video automation platform. Generate scripts, render videos, and automatically post to Instagram, Facebook, and LinkedIn.

## Quick Start (Docker)

```bash
git clone <your-repo>
cd socialmind

# Set required env vars
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials

docker-compose up --build
```

Open http://localhost:3000 → Register → Add API Keys in Settings → Create Video

## Quick Start (Local Dev)

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # Edit with your settings
python manage.py migrate
python manage.py runserver     # Terminal 1
celery -A config worker -l info  # Terminal 2
celery -A config beat -l info    # Terminal 3

# Frontend
cd ../frontend
npm install && npm run dev     # Terminal 4 → http://localhost:3000
```

## Tech Stack
- **Backend**: Python/Django + Celery + Redis + PostgreSQL
- **Frontend**: React 18 + Vite + TailwindCSS + Zustand
- **AI**: OpenAI GPT-4 / DeepSeek
- **Video**: MoviePy + FFmpeg
- **Storage**: AWS S3
- **Platforms**: Instagram Graph API, Facebook Graph API, LinkedIn API v2

## Features
- ✅ AI script and caption generation (OpenAI, DeepSeek)
- ✅ Automated video rendering with MoviePy
- ✅ Review and approval workflow
- ✅ Multi-platform scheduling (Instagram, Facebook, LinkedIn)
- ✅ Calendar view for post planning
- ✅ Analytics dashboard
- ✅ Encrypted API key storage
- ✅ JWT authentication
- ✅ Async task processing with Celery
- ✅ S3 video storage

## Project Structure
```
socialmind/
├── backend/          # Django API + Celery tasks
│   ├── apps/
│   │   ├── users/    # Auth, API keys, social accounts
│   │   ├── videos/   # Video projects, AI generation, rendering
│   │   ├── social/   # Scheduling, publishing, analytics
│   │   └── tasks/    # Task status API
│   ├── config/       # Django settings, URLs, Celery
│   └── requirements.txt
├── frontend/         # React SPA
│   └── src/
│       ├── api/      # Axios client
│       ├── pages/    # All page components
│       ├── components/ # Shared UI
│       └── store/    # Zustand stores
├── docker/           # Nginx config
├── docs/             # Full documentation
└── docker-compose.yml
```

See [docs/README.md](docs/README.md) for complete documentation including architecture diagrams, database schema, API reference, and deployment guide.
