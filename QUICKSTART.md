# SocialMind - Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Python 3.9+
- Docker (optional)

### Installation

#### Option 1: Docker (Recommended)
```bash
# Clone and navigate to project
cd socialmind-platform-updated

# Start all services
docker-compose up --build

# Access the app
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
```

#### Option 2: Manual Setup

**Backend:**
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Create superuser (optional)
python manage.py createsuperuser

# Start server
python manage.py runserver 8000
```

**Frontend:**
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Access at http://localhost:3000
```

### First Time Setup

1. **Register Account**
   - Go to http://localhost:3000
   - Click "Register"
   - Fill in email, password, name
   - Login with credentials

2. **Add API Keys** (Optional but recommended)
   - Navigate to Settings
   - Add your API keys:
     - Groq API (for AI generation & TTS)
     - Pexels (for stock footage)
     - OpenAI (alternative AI service)
     - ElevenLabs (premium voice)

3. **Create First Video**
   - Click "Create Video"
   - Fill in details
   - Click "Generate Video"
   - Wait for generation (~30-60 seconds)

4. **Generate Full Video**
   - Click "Video" mode
   - Click "Generate Full Video with Audio"
   - Wait for stitching process
   - Preview the result

5. **Approve & Schedule**
   - Click "Approve" button
   - Click "Schedule Post"
   - Select platforms and date/time
   - Submit

6. **Access Your Videos**
   - **Schedule page** - View scheduled posts
   - **Downloads page** - Download video files

## 🎯 Quick Workflow

```
Create Video → Generate → Preview Scenes → Generate Full Video
    ↓
Approve → Schedule → View in Schedule Page → Download
```

## ⚡ Keyboard Shortcuts

- **Preview Mode:**
  - `Space` - Play/Pause
  - `←/→` - Previous/Next scene
  - `R` - Restart
  - `F` - Fullscreen

- **Video Mode:**
  - `F` - Fullscreen
  - `M` - Mute/Unmute

## 🔑 Getting API Keys

### Groq API (Free Tier Available)
1. Visit https://console.groq.com
2. Sign up for account
3. Go to API Keys section
4. Create new API key
5. Copy and paste in Settings

### Pexels API (Free)
1. Visit https://www.pexels.com/api/
2. Sign up for account
3. Get API key from dashboard
4. Copy and paste in Settings

### OpenAI API (Paid)
1. Visit https://platform.openai.com
2. Sign up and add billing
3. Go to API Keys
4. Create new key
5. Copy and paste in Settings

### ElevenLabs API (Free tier available)
1. Visit https://elevenlabs.io
2. Sign up for account
3. Go to Profile → API Keys
4. Copy your API key
5. Paste in Settings

## 📁 Project Structure

```
socialmind/
├── backend/              # Django backend
│   ├── apps/
│   │   ├── users/       # Authentication
│   │   ├── videos/      # Video generation
│   │   └── social/      # Scheduling
│   └── config/          # Settings
├── frontend/            # React frontend
│   ├── src/
│   │   ├── pages/       # Page components
│   │   ├── components/  # Reusable components
│   │   └── api/         # API client
│   └── public/
└── docker-compose.yml   # Docker setup
```

## 🐛 Common Issues

### Port Already in Use
```bash
# Check what's using the port
lsof -i :3000  # Frontend
lsof -i :8000  # Backend

# Kill the process
kill -9 <PID>
```

### Database Errors
```bash
# Reset database
cd backend
rm db.sqlite3
python manage.py migrate
python manage.py createsuperuser
```

### Video Generation Fails
1. Check API keys are set correctly
2. Verify internet connection
3. Check browser console for errors
4. Try with shorter duration first

### Download Not Working
1. Ensure "Generate Full Video" was clicked
2. Wait for generation to complete
3. Check browser storage isn't full
4. Try clearing browser cache

## 🎨 Customization

### Change Theme Colors
Edit `frontend/tailwind.config.js`:
```javascript
colors: {
  brand: {
    400: '#your-color',
    500: '#your-color',
    600: '#your-color',
  }
}
```

### Add New Platforms
Edit `frontend/src/pages/LocalVideoDetailPage.jsx`:
```javascript
const PLATFORMS = [
  { id: 'your-platform', label: 'Platform Name', icon: '🎯', ... }
]
```

## 📚 Learn More

- [Complete Workflow Guide](./WORKFLOW_GUIDE.md)
- [API Documentation](./docs/API.md)
- [Contributing Guidelines](./CONTRIBUTING.md)

## 🆘 Support

- GitHub Issues: Report bugs and feature requests
- Email: support@socialmind.app
- Discord: Join our community

## 📄 License

MIT License - See LICENSE file for details

---

**Happy Creating! 🎬**
