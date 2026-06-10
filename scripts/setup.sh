#!/bin/bash
# setup.sh — Quick start for local development

set -e
echo "🚀 Setting up SocialMind..."

cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy env file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "⚠️  Created .env — please edit it with your credentials"
fi

# Generate encryption key
python3 -c "
from cryptography.fernet import Fernet
key = Fernet.generate_key().decode()
print(f'ENCRYPTION_KEY={key}')
print('Add the above to your .env file')
"

# Wait for DB
echo "⏳ Waiting for database..."
until python manage.py dbshell -- -c '\q' 2>/dev/null; do
    sleep 1
done

# Run migrations
python manage.py makemigrations users videos social tasks
python manage.py migrate

# Create superuser
echo "Creating superuser..."
python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(email='admin@socialmind.dev').exists():
    User.objects.create_superuser('admin', 'admin@socialmind.dev', 'admin123')
    print('Superuser created: admin@socialmind.dev / admin123')
else:
    print('Superuser already exists')
"

echo "✅ Backend setup complete!"
echo ""
echo "Run the following in separate terminals:"
echo "  1. python manage.py runserver"
echo "  2. celery -A config worker --loglevel=info"
echo "  3. celery -A config beat --loglevel=info"
echo ""
echo "cd ../frontend && npm install && npm run dev"
