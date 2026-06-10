# SocialMind — AI Video Automation Platform
## Complete Project Documentation

---

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [Database Schema](#2-database-schema)
3. [API Endpoint Reference](#3-api-endpoint-reference)
4. [Frontend Component Structure](#4-frontend-component-structure)
5. [Step-by-Step Implementation Guide](#5-step-by-step-implementation-guide)
6. [Deployment Strategy](#6-deployment-strategy)
7. [Environment Variables](#7-environment-variables)
8. [Social Media API Setup](#8-social-media-api-setup)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER / MOBILE                          │
│                    React.js SPA (Port 3000)                      │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP/REST
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        NGINX (Port 80)                           │
│              Reverse Proxy + Static Files                        │
└──────────┬──────────────────────────────────────────┬──────────┘
           │ /api/*                                   │ /*
           ▼                                          ▼
┌──────────────────┐                      ┌──────────────────────┐
│  Django/DRF      │                      │  React Build (nginx)  │
│  (Port 8000)     │                      │                      │
│  - Auth (JWT)    │                      └──────────────────────┘
│  - Videos API    │
│  - Social API    │
│  - Task Status   │
└────────┬─────────┘
         │ Task Queue
         ▼
┌──────────────────┐      ┌──────────────────┐
│  Redis (6379)    │◄────►│  Celery Workers  │
│  - Task broker   │      │  - AI generation │
│  - Result cache  │      │  - Video render  │
└──────────────────┘      │  - S3 upload     │
                          │  - Publishing    │
                          └────────┬─────────┘
         ┌──────────────────────────────────────┐
         │                                      │
         ▼                                      ▼
┌──────────────────┐              ┌─────────────────────────┐
│  PostgreSQL      │              │  External APIs           │
│  - Users         │              │  - OpenAI / DeepSeek    │
│  - Videos        │              │  - Instagram Graph API  │
│  - Social accts  │              │  - Facebook Graph API   │
│  - Schedules     │              │  - LinkedIn API v2      │
└──────────────────┘              │  - AWS S3               │
                                  └─────────────────────────┘
```

### Component Responsibilities

| Component | Technology | Role |
|-----------|-----------|------|
| Frontend | React 18 + Vite + TailwindCSS | SPA UI, video preview, scheduling calendar |
| API Server | Django 4.2 + DRF | REST API, JWT auth, business logic |
| Task Queue | Celery + Redis | Async video gen, publishing, scheduling |
| Database | PostgreSQL 15 | Persistent data store |
| Storage | AWS S3 (or local) | Video files, thumbnails, assets |
| AI Services | OpenAI, DeepSeek | Script generation, captions, hashtags |
| Video Engine | MoviePy + FFmpeg | Video rendering from scripts |
| Publishers | Platform APIs | Instagram, Facebook, LinkedIn posting |

---

## 2. Database Schema

### users table
```sql
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(254) UNIQUE NOT NULL,
    username        VARCHAR(150) UNIQUE NOT NULL,
    first_name      VARCHAR(150),
    last_name       VARCHAR(150),
    avatar          VARCHAR(255),
    bio             TEXT,
    subscription_plan VARCHAR(20) DEFAULT 'free',
    monthly_video_quota INTEGER DEFAULT 10,
    videos_generated_this_month INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    date_joined     TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### api_key_configs table
```sql
CREATE TABLE api_key_configs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    service         VARCHAR(50) NOT NULL,  -- openai, deepseek, elevenlabs, etc.
    encrypted_key   BYTEA NOT NULL,        -- Fernet encrypted
    is_active       BOOLEAN DEFAULT TRUE,
    label           VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_used       TIMESTAMPTZ,
    UNIQUE(user_id, service)
);
```

### social_accounts table
```sql
CREATE TABLE social_accounts (
    id                    SERIAL PRIMARY KEY,
    user_id               INTEGER REFERENCES users(id) ON DELETE CASCADE,
    platform              VARCHAR(30) NOT NULL,  -- instagram, facebook, linkedin
    platform_user_id      VARCHAR(255) NOT NULL,
    platform_username     VARCHAR(255) NOT NULL,
    platform_name         VARCHAR(255),
    avatar_url            VARCHAR(500),
    encrypted_access_token  BYTEA NOT NULL,
    encrypted_refresh_token BYTEA,
    token_expires_at      TIMESTAMPTZ,
    is_active             BOOLEAN DEFAULT TRUE,
    page_id               VARCHAR(255),
    connected_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, platform, platform_user_id)
);
```

### video_projects table
```sql
CREATE TABLE video_projects (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title             VARCHAR(255) NOT NULL,
    description       TEXT,
    content_type      VARCHAR(30),  -- promotional, educational, etc.
    status            VARCHAR(20) DEFAULT 'draft',
    -- AI inputs
    topic             TEXT NOT NULL,
    target_audience   VARCHAR(255),
    tone              VARCHAR(50),
    duration_seconds  INTEGER DEFAULT 30,
    ai_service        VARCHAR(30) DEFAULT 'openai',
    -- AI outputs
    ai_script         TEXT,
    ai_caption        TEXT,
    ai_hashtags       JSONB DEFAULT '[]',
    ai_keywords       JSONB DEFAULT '[]',
    -- Files
    video_url         VARCHAR(500),
    thumbnail_url     VARCHAR(500),
    duration_actual   FLOAT,
    file_size         BIGINT,
    resolution        VARCHAR(20),
    format            VARCHAR(10) DEFAULT 'mp4',
    -- User edits
    edited_caption    TEXT,
    edited_hashtags   JSONB DEFAULT '[]',
    user_notes        TEXT,
    -- Tracking
    generation_task_id VARCHAR(255),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    approved_at       TIMESTAMPTZ
);
```

### scheduled_posts table
```sql
CREATE TABLE scheduled_posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           INTEGER REFERENCES users(id) ON DELETE CASCADE,
    project_id        UUID REFERENCES video_projects(id) ON DELETE CASCADE,
    social_account_id INTEGER REFERENCES social_accounts(id) ON DELETE CASCADE,
    custom_caption    TEXT,
    custom_hashtags   JSONB DEFAULT '[]',
    scheduled_at      TIMESTAMPTZ NOT NULL,
    status            VARCHAR(20) DEFAULT 'scheduled',
    published_at      TIMESTAMPTZ,
    platform_post_id  VARCHAR(255),
    platform_url      VARCHAR(500),
    error_message     TEXT,
    celery_task_id    VARCHAR(255),
    -- Analytics
    likes_count       INTEGER DEFAULT 0,
    comments_count    INTEGER DEFAULT 0,
    shares_count      INTEGER DEFAULT 0,
    views_count       INTEGER DEFAULT 0,
    reach             INTEGER DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

### generation_logs table
```sql
CREATE TABLE generation_logs (
    id              SERIAL PRIMARY KEY,
    project_id      UUID REFERENCES video_projects(id) ON DELETE CASCADE,
    ai_service      VARCHAR(30),
    prompt_used     TEXT,
    response_data   JSONB DEFAULT '{}',
    tokens_used     INTEGER,
    cost_estimate   DECIMAL(10,6),
    success         BOOLEAN DEFAULT FALSE,
    error_message   TEXT,
    duration_seconds FLOAT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. API Endpoint Reference

### Authentication
```
POST   /api/v1/auth/register/              Register new user
POST   /api/v1/auth/login/                 Login (returns JWT)
POST   /api/v1/auth/token/refresh/         Refresh access token
GET    /api/v1/auth/profile/               Get current user profile
PATCH  /api/v1/auth/profile/               Update profile
```

### API Key Management
```
GET    /api/v1/auth/api-keys/              List all API keys
POST   /api/v1/auth/api-keys/             Add new API key
PATCH  /api/v1/auth/api-keys/{id}/        Update API key
DELETE /api/v1/auth/api-keys/{id}/        Delete API key
POST   /api/v1/auth/api-keys/{id}/test/   Test API key validity
```

### Social Accounts
```
GET    /api/v1/auth/social-accounts/               List connected accounts
POST   /api/v1/auth/social-accounts/connect_oauth/ Connect via OAuth token
POST   /api/v1/auth/social-accounts/{id}/disconnect/ Disconnect account
GET    /api/v1/auth/social-accounts/by_platform/   Filter by platform
```

### Video Projects
```
GET    /api/v1/videos/projects/              List projects (filterable)
POST   /api/v1/videos/projects/             Create new project
GET    /api/v1/videos/projects/{id}/        Get project detail
PATCH  /api/v1/videos/projects/{id}/        Update project
DELETE /api/v1/videos/projects/{id}/        Delete project
POST   /api/v1/videos/projects/{id}/generate/  Trigger AI generation
POST   /api/v1/videos/projects/{id}/approve/   Approve for publishing
POST   /api/v1/videos/projects/{id}/reject/    Reject (back to draft)
GET    /api/v1/videos/projects/{id}/status/    Get generation status
POST   /api/v1/videos/projects/{id}/upload_asset/ Upload media asset
```

### Scheduling & Publishing
```
GET    /api/v1/social/posts/                    List scheduled posts
POST   /api/v1/social/posts/                    Schedule a post
PATCH  /api/v1/social/posts/{id}/               Update scheduled post
DELETE /api/v1/social/posts/{id}/               Cancel/delete post
POST   /api/v1/social/posts/{id}/publish_now/   Publish immediately
POST   /api/v1/social/posts/{id}/cancel/        Cancel scheduling
GET    /api/v1/social/posts/calendar/           Calendar view (date range)
GET    /api/v1/social/posts/analytics_summary/  Aggregate analytics
```

### Task Status
```
GET    /api/v1/tasks/{task_id}/            Celery task status & progress
```

---

## 4. Frontend Component Structure

```
src/
├── api/
│   └── client.js              # Axios instance + all API functions
├── store/
│   └── auth.js                # Zustand auth store
├── components/
│   ├── layout/
│   │   └── AppLayout.jsx      # Sidebar nav + top bar shell
│   └── ui/
│       ├── index.jsx           # Shared UI: StatusBadge, StatCard, Modal, etc.
│       └── LoadingScreen.jsx   # Full-screen loading state
├── pages/
│   ├── LoginPage.jsx           # Auth: split-panel login
│   ├── RegisterPage.jsx        # Auth: registration form
│   ├── DashboardPage.jsx       # Overview: stats, recent videos, schedule
│   ├── VideosPage.jsx          # Video library with filter/search
│   ├── CreateVideoPage.jsx     # AI video creation form
│   ├── VideoDetailPage.jsx     # Review, approve, edit caption, schedule
│   ├── SchedulePage.jsx        # List + calendar view of posts
│   ├── AnalyticsPage.jsx       # Charts: platform performance, trends
│   └── SettingsPage.jsx        # Profile, API keys, social accounts
├── App.jsx                     # Router + QueryClient + Toaster
├── main.jsx                    # React entry point
└── index.css                   # Tailwind + custom CSS variables
```

### Key Data Flow
```
User fills CreateVideoPage form
  → POST /api/v1/videos/projects/ (create project)
  → POST /api/v1/videos/projects/{id}/generate/ (trigger Celery task)
  → Celery worker: AI script → video render → S3 upload
  → Project status: draft → generating → review
  → VideoDetailPage polls /status/ every 3s
  → User reviews script, edits caption, approves
  → POST /approve/ → status: approved
  → User schedules: POST /api/v1/social/posts/
  → Celery Beat checks every minute for due posts
  → publish_post_task → platform API → published
```

---

## 5. Step-by-Step Implementation Guide

### Step 1: Prerequisites

```bash
# Install system tools
brew install postgresql redis ffmpeg   # macOS
# or
apt-get install postgresql redis-server ffmpeg  # Ubuntu

# Install Python 3.11+
python3 --version  # should be 3.11+

# Install Node 20+
node --version  # should be 20+
```

### Step 2: Clone & Backend Setup

```bash
cd socialmind/backend

# Create virtual environment
python3 -m venv venv && source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Generate encryption key
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Add output as ENCRYPTION_KEY in .env
```

### Step 3: Database Setup

```bash
# Create PostgreSQL database
createdb socialmind

# Run migrations
python manage.py makemigrations users videos social tasks
python manage.py migrate

# Create admin user
python manage.py createsuperuser
```

### Step 4: Start Backend Services

```bash
# Terminal 1: Django dev server
python manage.py runserver

# Terminal 2: Celery worker (video generation + publishing)
celery -A config worker --loglevel=info

# Terminal 3: Celery beat (scheduled post trigger)
celery -A config beat --loglevel=info
```

### Step 5: Frontend Setup

```bash
cd ../frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

### Step 6: Add API Keys (in the app)

1. Register/login at http://localhost:3000
2. Go to Settings → API Keys
3. Add your OpenAI or DeepSeek API key
4. Go to Settings → Social Accounts
5. Connect your social media accounts

### Step 7: Create Your First Video

1. Click "Create Video" in sidebar
2. Enter title, topic, tone, and duration
3. Select your AI service
4. Click "Generate with AI"
5. Watch the progress bar as AI generates
6. Review the script and caption
7. Edit if needed, then Approve
8. Schedule for a platform

---

## 6. Deployment Strategy

### Development (Local)
```bash
# All-in-one with Docker Compose
docker-compose up --build

# Or run each service manually (see Step 4-5 above)
```

### Staging / Production (Docker)

```bash
# 1. Set environment variables
export SECRET_KEY="your-production-secret"
export ENCRYPTION_KEY="$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
export AWS_ACCESS_KEY_ID="your-aws-key"
export AWS_SECRET_ACCESS_KEY="your-aws-secret"
export AWS_STORAGE_BUCKET_NAME="your-bucket"

# 2. Build and deploy
docker-compose -f docker-compose.yml up -d --build

# 3. Run migrations in container
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py createsuperuser
```

### AWS Production Architecture

```
Route 53 (DNS)
    ↓
CloudFront (CDN for frontend + media)
    ↓
Application Load Balancer
    ├── ECS Fargate: Django API (auto-scaling)
    ├── ECS Fargate: Celery Workers (auto-scaling)
    └── ECS Fargate: Celery Beat (1 instance)
         ↓              ↓
    RDS PostgreSQL    ElastiCache Redis
                         ↓
                      S3 (videos, thumbnails, assets)
```

### Key Production Checklist

- [ ] Set `DEBUG=False` in environment
- [ ] Generate strong `SECRET_KEY` and `ENCRYPTION_KEY`
- [ ] Configure `ALLOWED_HOSTS` with your domain
- [ ] Set up SSL/TLS (Let's Encrypt or ACM)
- [ ] Configure S3 bucket with appropriate IAM policies
- [ ] Set `DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'`
- [ ] Configure CloudFront for S3 CDN
- [ ] Set up PostgreSQL with read replicas for scale
- [ ] Configure Redis Cluster or ElastiCache
- [ ] Set up log aggregation (CloudWatch, Datadog)
- [ ] Configure Sentry for error tracking
- [ ] Add rate limiting to API endpoints
- [ ] Set up database backups (RDS automated backups)
- [ ] Configure Celery worker auto-scaling based on queue depth

---

## 7. Environment Variables

```bash
# ── Django Core ────────────────────────────────────────
SECRET_KEY=                    # Django secret key (required)
DEBUG=False                    # Set False in production
ALLOWED_HOSTS=yourdomain.com   # Comma-separated allowed hosts
CORS_ORIGINS=https://app.yourdomain.com

# ── Database ───────────────────────────────────────────
DB_NAME=socialmind
DB_USER=postgres
DB_PASSWORD=your-db-password
DB_HOST=localhost               # or RDS endpoint
DB_PORT=5432

# ── Redis ──────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── Security ───────────────────────────────────────────
ENCRYPTION_KEY=                # Fernet key for API key encryption (required)
                               # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# ── AWS S3 ─────────────────────────────────────────────
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_STORAGE_BUCKET_NAME=socialmind-media
AWS_S3_REGION_NAME=us-east-1

# ── Social OAuth (for production OAuth flows) ──────────
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
```

---

## 8. Social Media API Setup

### Instagram / Facebook (Meta)
1. Create a Meta Developer account at https://developers.facebook.com
2. Create a new App → Business type
3. Add "Instagram Graph API" and "Facebook Pages API" products
4. Get App ID and App Secret
5. Generate a User Access Token with permissions:
   - `pages_manage_posts`, `pages_read_engagement`
   - `instagram_content_publish`, `instagram_basic`
6. Exchange for a long-lived token (60 days) or Page token (never expires)

### LinkedIn
1. Create a LinkedIn Developer app at https://developer.linkedin.com
2. Request "Share on LinkedIn" and "Video Upload" products
3. OAuth 2.0 scopes needed: `w_member_social`, `r_basicprofile`
4. Implement OAuth flow and store access token

### Important Notes
- **Instagram**: Requires a Business or Creator account connected to a Facebook Page
- **Video formats**: MP4, H.264, up to 4GB, 3-60 seconds for Reels
- **Rate limits**: Instagram 200 calls/hour, Facebook 200 calls/hour per app, LinkedIn 500/day
- In development, use the Settings page manual token entry to test without full OAuth
- In production, implement proper OAuth callback endpoints for each platform
```
