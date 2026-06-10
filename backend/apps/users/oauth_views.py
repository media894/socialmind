"""
OAuth callback handlers for Instagram, Facebook, and LinkedIn.
These endpoints receive the OAuth code and exchange it for an access token.
In production, configure your OAuth apps to redirect here.
"""
import json
import os
import httpx
from datetime import timedelta
from django.conf import settings

def _build_redirect_uri(path):
    base = os.environ.get('PUBLIC_APP_URL', getattr(settings, 'PUBLIC_APP_URL', '')).rstrip('/')
    if base:
        return base + path
    return None


def _google_oauth_redirect_uri(request, path):
    """
    Build the Google OAuth redirect URI.

    Prefer an explicit Google redirect base if one is configured. Otherwise use
    the public app URL, which is proxied to the backend in local development.
    Fall back to the backend origin only as a last resort.
    """
    base = os.environ.get('GOOGLE_OAUTH_REDIRECT_BASE', '').rstrip('/')
    if base:
        return base + path
    public_base = os.environ.get('PUBLIC_APP_URL', getattr(settings, 'PUBLIC_APP_URL', '')).rstrip('/')
    if public_base:
        return public_base + path
    return f'http://localhost:8000{path}'


def _public_oauth_redirect_uri(path, override_env='OAUTH_REDIRECT_BASE'):
    base = os.environ.get(override_env, '').rstrip('/')
    if base:
        return base + path
    public_base = os.environ.get('PUBLIC_APP_URL', getattr(settings, 'PUBLIC_APP_URL', '')).rstrip('/')
    if public_base:
        return public_base + path
    return f'http://localhost:8000{path}'


def _frontend_origin():
    return (
        os.environ.get('CORS_ORIGINS', '').split(',')[0].strip()
        or os.environ.get('PUBLIC_APP_URL', '').rstrip('/')
        or 'http://localhost:3000'
    )
from django.utils import timezone
from django.http import HttpResponse, HttpResponseRedirect
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from apps.users.models import SocialAccount
from urllib.parse import quote
from .views import _get_or_create_workspace_account, _issue_tokens_for_user

META_GRAPH_VERSION = 'v18.0'
META_GRAPH_BASE = f'https://graph.facebook.com/{META_GRAPH_VERSION}'


def _meta_credentials():
    app_id = (
        os.environ.get('FACEBOOK_APP_ID')
        or os.environ.get('INSTAGRAM_APP_ID')
        or getattr(settings, 'FACEBOOK_APP_ID', '')
        or getattr(settings, 'INSTAGRAM_APP_ID', '')
    )
    app_secret = (
        os.environ.get('FACEBOOK_APP_SECRET')
        or os.environ.get('INSTAGRAM_APP_SECRET')
        or getattr(settings, 'FACEBOOK_APP_SECRET', '')
        or getattr(settings, 'INSTAGRAM_APP_SECRET', '')
    )
    return app_id, app_secret


# ─── Instagram / Facebook OAuth ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def instagram_oauth_start(request):
    """Redirect user to Meta OAuth consent for Facebook Page and Instagram publishing."""
    app_id, app_secret = _meta_credentials()
    missing = [v for v, val in [('FACEBOOK_APP_ID', app_id), ('FACEBOOK_APP_SECRET', app_secret)] if not val]
    if missing:
        return Response(
            {
                'error': (
                    f'Meta OAuth is not configured on the server. '
                    f'Missing environment variable(s): {", ".join(missing)}. '
                    'Set these in your backend .env file and restart the server.'
                )
            },
            status=503,
        )

    redirect_uri = _public_oauth_redirect_uri('/api/v1/auth/oauth/instagram/callback/', 'META_OAUTH_REDIRECT_BASE')
    scopes = ','.join([
        'public_profile',
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'pages_manage_metadata',
        'instagram_basic',
        'instagram_content_publish',
        'business_management',
    ])
    url = (
        f'https://www.facebook.com/{META_GRAPH_VERSION}/dialog/oauth'
        f'?client_id={app_id}'
        f'&redirect_uri={quote(redirect_uri, safe="")}'
        f'&scope={quote(scopes, safe=",")}'
        f'&response_type=code'
        f'&auth_type=rerequest'
        f'&state={request.user.id}'
    )
    return Response({'auth_url': url})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def instagram_oauth_callback(request):
    """Handle Meta OAuth callback and store publish-ready Page tokens."""
    code = request.GET.get('code')
    user_id = request.GET.get('state')
    error = request.GET.get('error')
    frontend_origin = _frontend_origin()

    if error:
        return HttpResponseRedirect(f'{frontend_origin}/settings?error=meta_denied')

    if not code or not user_id:
        return Response({'error': 'Missing code or state'}, status=400)

    app_id, app_secret = _meta_credentials()
    redirect_uri = _public_oauth_redirect_uri('/api/v1/auth/oauth/instagram/callback/', 'META_OAUTH_REDIRECT_BASE')

    with httpx.Client(timeout=30) as client:
        # Exchange code for token
        token_resp = client.get(
            f'{META_GRAPH_BASE}/oauth/access_token',
            params={
                'client_id': app_id,
                'client_secret': app_secret,
                'code': code,
                'redirect_uri': redirect_uri,
            }
        )
        token_data = token_resp.json()
        access_token = token_data.get('access_token')

        if not access_token:
            return Response({'error': f'Token exchange failed: {token_data}'}, status=400)

        # Exchange for long-lived token
        long_lived_resp = client.get(
            f'{META_GRAPH_BASE}/oauth/access_token',
            params={
                'grant_type': 'fb_exchange_token',
                'client_id': app_id,
                'client_secret': app_secret,
                'fb_exchange_token': access_token,
            }
        )
        ll_data = long_lived_resp.json()
        long_lived_token = ll_data.get('access_token', access_token)

        # The access_token field is a Page access token, which is what Page video publishing needs.
        pages_resp = client.get(
            f'{META_GRAPH_BASE}/me/accounts',
            params={
                'access_token': long_lived_token,
                'fields': 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
            }
        )
        pages_data = pages_resp.json()
        pages = pages_data.get('data', [])

        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.get(id=user_id)

        if not pages:
            import logging
            logging.getLogger(__name__).error(f"META_PAGES_DEBUG: {pages_data}")
            return HttpResponseRedirect(f'{frontend_origin}/settings?error=meta_no_pages')

        connected = 0
        for page in pages:
            page_id = str(page.get('id') or '')
            page_name = page.get('name') or 'Facebook Page'
            page_token = page.get('access_token') or long_lived_token
            if not page_id:
                continue

            fb_account, _ = SocialAccount.objects.update_or_create(
                user=user,
                platform='facebook',
                platform_user_id=page_id,
                defaults={
                    'platform_username': page_name,
                    'platform_name': page_name,
                    'page_id': page_id,
                    'is_active': True,
                }
            )
            fb_account.set_access_token(page_token)
            fb_account.save()
            connected += 1

            ig_account = page.get('instagram_business_account')
            if ig_account:
                ig_id = str(ig_account.get('id') or '')
                if not ig_id:
                    continue

                account, _ = SocialAccount.objects.update_or_create(
                    user=user, platform='instagram', platform_user_id=ig_id,
                    defaults={
                        'platform_username': ig_account.get('username', ''),
                        'platform_name': ig_account.get('name', '') or page_name,
                        'avatar_url': ig_account.get('profile_picture_url', ''),
                        'page_id': page_id,
                        'is_active': True,
                    }
                )
                account.set_access_token(page_token)
                account.save()
                connected += 1

    if not connected:
        return HttpResponseRedirect(f'{frontend_origin}/settings?error=meta_no_accounts')

    return HttpResponseRedirect(f'{frontend_origin}/settings?connected=meta')


# ─── LinkedIn OAuth ───────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def linkedin_oauth_start(request):
    """Redirect user to LinkedIn OAuth consent screen"""
    client_id = os.environ.get('LINKEDIN_CLIENT_ID', '')
    redirect_uri = request.build_absolute_uri('/api/v1/auth/oauth/linkedin/callback/')
    scopes = 'w_member_social r_basicprofile r_liteprofile'
    url = (
        f'https://www.linkedin.com/oauth/v2/authorization'
        f'?response_type=code'
        f'&client_id={client_id}'
        f'&redirect_uri={redirect_uri}'
        f'&state={request.user.id}'
        f'&scope={scopes.replace(" ", "%20")}'
    )
    return Response({'auth_url': url})


@api_view(['GET'])
def linkedin_oauth_callback(request):
    """Handle OAuth callback from LinkedIn"""
    code = request.GET.get('code')
    user_id = request.GET.get('state')

    if not code or not user_id:
        return Response({'error': 'Missing code or state'}, status=400)

    client_id = os.environ.get('LINKEDIN_CLIENT_ID', '')
    client_secret = os.environ.get('LINKEDIN_CLIENT_SECRET', '')
    redirect_uri = request.build_absolute_uri('/api/v1/auth/oauth/linkedin/callback/')

    with httpx.Client() as client:
        token_resp = client.post(
            'https://www.linkedin.com/oauth/v2/accessToken',
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': redirect_uri,
                'client_id': client_id,
                'client_secret': client_secret,
            }
        )
        token_data = token_resp.json()
        access_token = token_data.get('access_token')

        if not access_token:
            return Response({'error': f'Token exchange failed: {token_data}'}, status=400)

        # Get profile info
        profile_resp = client.get(
            'https://api.linkedin.com/v2/me',
            headers={'Authorization': f'Bearer {access_token}'},
            params={'fields': 'id,localizedFirstName,localizedLastName'}
        )
        profile = profile_resp.json()
        li_id = profile.get('id', '')
        name = f"{profile.get('localizedFirstName', '')} {profile.get('localizedLastName', '')}".strip()

        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.get(id=user_id)

        account, _ = SocialAccount.objects.update_or_create(
            user=user, platform='linkedin', platform_user_id=li_id,
            defaults={
                'platform_username': li_id,
                'platform_name': name,
                'is_active': True,
            }
        )
        account.set_access_token(access_token)
        account.save()

    return HttpResponseRedirect(f'{_frontend_origin()}/settings?connected=linkedin')


# ─── YouTube OAuth ────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def youtube_oauth_start(request):
    """Redirect user to Google OAuth consent screen for YouTube publishing."""
    client_id = os.environ.get('GOOGLE_CLIENT_ID', '')
    client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '')
    missing = [v for v, val in [('GOOGLE_CLIENT_ID', client_id), ('GOOGLE_CLIENT_SECRET', client_secret)] if not val]
    if missing:
        return Response(
            {
                'error': (
                    f'Google OAuth is not configured on the server. '
                    f'Missing environment variable(s): {", ".join(missing)}. '
                    'Set these in your backend .env file and restart the server.'
                )
            },
            status=503,
        )
    redirect_uri = _google_oauth_redirect_uri(request, '/api/v1/auth/oauth/youtube/callback/')
    scopes = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'
    url = (
        'https://accounts.google.com/o/oauth2/v2/auth'
        f'?client_id={client_id}'
        f'&redirect_uri={quote(redirect_uri, safe="")}'
        f'&response_type=code'
        f'&scope={scopes.replace(" ", "%20")}'
        f'&access_type=offline'
        f'&prompt=select_account%20consent'
        f'&include_granted_scopes=true'
        f'&state={request.user.id}'
    )
    return Response({'auth_url': url})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def youtube_oauth_callback(request):
    """Handle Google OAuth callback and store the connected YouTube channel."""
    code = request.GET.get('code')
    user_id = request.GET.get('state')

    if not code or not user_id:
        return Response({'error': 'Missing code or state'}, status=400)

    client_id = os.environ.get('GOOGLE_CLIENT_ID', '')
    client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '')
    redirect_uri = _google_oauth_redirect_uri(request, '/api/v1/auth/oauth/youtube/callback/')

    with httpx.Client(timeout=30) as client:
        token_resp = client.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': code,
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': redirect_uri,
                'grant_type': 'authorization_code',
            },
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
        )
        token_data = token_resp.json()
        access_token = token_data.get('access_token')
        refresh_token = token_data.get('refresh_token')
        expires_in = int(token_data.get('expires_in') or 0)

        if not access_token:
            return Response({'error': f'Token exchange failed: {token_data}'}, status=400)

        profile_resp = client.get(
            'https://www.googleapis.com/youtube/v3/channels',
            params={'part': 'id,snippet', 'mine': 'true'},
            headers={'Authorization': f'Bearer {access_token}'},
        )
        profile_data = profile_resp.json()
        items = profile_data.get('items') or []

        if items:
            channel = items[0]
            channel_id = channel.get('id', '')
            snippet = channel.get('snippet') or {}
            channel_title = snippet.get('title', '') or 'My YouTube Channel'
            channel_handle = snippet.get('customUrl') or channel_title or channel_id
        else:
            # No channel yet — use Google account info as placeholder
            userinfo_resp = client.get(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f'Bearer {access_token}'},
            )
            userinfo = userinfo_resp.json()
            channel_id = userinfo.get('id', str(user_id))
            channel_title = userinfo.get('name') or userinfo.get('email') or 'YouTube Account'
            channel_handle = userinfo.get('email') or channel_title

        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.get(id=user_id)

        account, _ = SocialAccount.objects.update_or_create(
            user=user,
            platform='youtube',
            platform_user_id=channel_id,
            defaults={
                'platform_username': channel_handle,
                'platform_name': channel_title,
                'is_active': True,
                'token_expires_at': timezone.now() + timedelta(seconds=expires_in) if expires_in else None,
            }
        )
        account.set_access_token(access_token)
        if refresh_token:
            account.set_refresh_token(refresh_token)
        account.save()

    return HttpResponseRedirect(f'{_frontend_origin()}/settings?connected=youtube')


# ─── Google Login OAuth ───────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def google_login_start(request):
    """Redirect a visitor to Google OAuth for login/signup."""
    client_id = os.environ.get('GOOGLE_CLIENT_ID', '')
    client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '')
    missing = [v for v, val in [('GOOGLE_CLIENT_ID', client_id), ('GOOGLE_CLIENT_SECRET', client_secret)] if not val]
    if missing:
        return Response(
            {
                'error': (
                    f'Google login is not configured on the server. '
                    f'Missing environment variable(s): {", ".join(missing)}. '
                    'Set these in your backend .env file and restart the server.'
                )
            },
            status=503,
        )

    redirect_uri = _google_oauth_redirect_uri(request, '/api/v1/auth/oauth/google/callback/')
    scopes = 'openid email profile'
    url = (
        'https://accounts.google.com/o/oauth2/v2/auth'
        f'?client_id={client_id}'
        f'&redirect_uri={quote(redirect_uri, safe="")}'
        f'&response_type=code'
        f'&scope={scopes.replace(" ", "%20")}'
        f'&access_type=offline'
        f'&prompt=select_account%20consent'
        f'&include_granted_scopes=true'
    )
    return Response({'auth_url': url})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def google_login_callback(request):
    """Handle Google OAuth callback and issue workspace tokens."""
    code = request.GET.get('code')
    if not code:
        return Response({'error': 'Missing code'}, status=400)

    client_id = os.environ.get('GOOGLE_CLIENT_ID', '')
    client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '')
    redirect_uri = _google_oauth_redirect_uri(request, '/api/v1/auth/oauth/google/callback/')
    frontend_origin = _frontend_origin()

    with httpx.Client(timeout=30) as client:
        token_resp = client.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': code,
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': redirect_uri,
                'grant_type': 'authorization_code',
            },
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
        )
        token_data = token_resp.json()
        access_token = token_data.get('access_token')

        if not access_token:
            return Response({'error': f'Token exchange failed: {token_data}'}, status=400)

        userinfo_resp = client.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers={'Authorization': f'Bearer {access_token}'},
        )
        userinfo = userinfo_resp.json()

    email = str(userinfo.get('email') or '').strip().lower()
    if not email:
        return Response({'error': 'Google did not return an email address.'}, status=400)

    user = _get_or_create_workspace_account(email)
    user.first_name = str(userinfo.get('given_name') or user.first_name or '').strip()
    user.last_name = str(userinfo.get('family_name') or user.last_name or '').strip()
    user.save(update_fields=['first_name', 'last_name'])

    payload = {
        'type': 'socialmind-google-auth',
        **_issue_tokens_for_user(user),
    }

    html = f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Signing you in...</title>
  </head>
  <body>
    <script>
      (function() {{
        const payload = {json.dumps(payload)};
        const targetOrigin = {json.dumps(frontend_origin)};
        if (window.opener) {{
          window.opener.postMessage(payload, targetOrigin);
          window.close();
        }} else {{
          try {{ localStorage.setItem('__sm_google_auth__', JSON.stringify(payload)); }} catch(e) {{}}
          document.body.innerHTML = '<p>Authentication complete. You can close this window.</p>';
        }}
      }})();
    </script>
  </body>
</html>
"""
    return HttpResponse(html, content_type='text/html')


# ─── Twitter / X OAuth 2.0 PKCE ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def twitter_oauth_start(request):
    """Redirect user to Twitter OAuth 2.0 PKCE consent screen."""
    import base64
    import hashlib
    import secrets
    from django.core.cache import cache

    client_id = os.environ.get('TWITTER_CLIENT_ID', '')
    if not client_id:
        return Response(
            {
                'error': (
                    'Twitter OAuth is not configured. '
                    'Add TWITTER_CLIENT_ID (and TWITTER_CLIENT_SECRET) to your backend .env file. '
                    'Get them from https://developer.twitter.com/ → Projects & Apps → Your App → Keys and Tokens.'
                )
            },
            status=503,
        )

    code_verifier = secrets.token_urlsafe(40)
    code_challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest())
        .rstrip(b'=')
        .decode()
    )
    state = secrets.token_urlsafe(16)

    cache.set(
        f'twitter_pkce_{state}',
        {'code_verifier': code_verifier, 'user_id': str(request.user.id)},
        timeout=300,
    )

    redirect_uri = _google_oauth_redirect_uri(request, '/api/v1/auth/oauth/twitter/callback/')
    scopes = 'tweet.read tweet.write users.read offline.access media.write'

    url = (
        'https://twitter.com/i/oauth2/authorize'
        f'?client_id={client_id}'
        f'&redirect_uri={quote(redirect_uri, safe="")}'
        '&response_type=code'
        f'&scope={scopes.replace(" ", "%20")}'
        f'&state={state}'
        f'&code_challenge={code_challenge}'
        '&code_challenge_method=S256'
    )
    return Response({'auth_url': url})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def twitter_oauth_callback(request):
    """Handle Twitter OAuth 2.0 PKCE callback and store the connected account."""
    import base64
    import secrets
    from django.core.cache import cache

    code = request.GET.get('code')
    state = request.GET.get('state')
    error = request.GET.get('error')
    frontend_origin = _frontend_origin()

    if error:
        return HttpResponseRedirect(f'{frontend_origin}/settings?error=twitter_denied')
    if not code or not state:
        return HttpResponseRedirect(f'{frontend_origin}/settings?error=twitter_missing_params')

    cached = cache.get(f'twitter_pkce_{state}')
    if not cached:
        return HttpResponseRedirect(f'{frontend_origin}/settings?error=twitter_expired_state')

    code_verifier = cached['code_verifier']
    user_id = cached['user_id']
    cache.delete(f'twitter_pkce_{state}')

    client_id = os.environ.get('TWITTER_CLIENT_ID', '')
    client_secret = os.environ.get('TWITTER_CLIENT_SECRET', '')
    redirect_uri = _google_oauth_redirect_uri(request, '/api/v1/auth/oauth/twitter/callback/')

    with httpx.Client(timeout=30) as client:
        token_resp = client.post(
            'https://api.twitter.com/2/oauth2/token',
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': redirect_uri,
                'code_verifier': code_verifier,
            },
            auth=(client_id, client_secret),
        )
        token_data = token_resp.json()
        access_token = token_data.get('access_token')
        refresh_token = token_data.get('refresh_token')

        if not access_token:
            return HttpResponseRedirect(f'{frontend_origin}/settings?error=twitter_token_failed')

        user_resp = client.get(
            'https://api.twitter.com/2/users/me',
            headers={'Authorization': f'Bearer {access_token}'},
            params={'user.fields': 'id,name,username'},
        )
        user_data = user_resp.json().get('data', {}) if user_resp.status_code == 200 else {}
        twitter_id = str(user_data.get('id') or '')
        twitter_username = str(user_data.get('username') or '')
        twitter_name = str(user_data.get('name') or twitter_username)

    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return HttpResponseRedirect(f'{frontend_origin}/settings?error=twitter_user_not_found')

    account, _ = SocialAccount.objects.update_or_create(
        user=user,
        platform='twitter',
        platform_user_id=twitter_id or twitter_username,
        defaults={
            'platform_username': twitter_username,
            'platform_name': twitter_name,
            'is_active': True,
        },
    )
    account.set_access_token(access_token)
    if refresh_token:
        account.set_refresh_token(refresh_token)
    account.save()

    return HttpResponseRedirect(f'{frontend_origin}/settings?connected=twitter')


# ─── Facebook Login OAuth ─────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def facebook_login_start(request):
    """Redirect a visitor to Facebook OAuth for login/signup."""
    app_id = os.environ.get('FACEBOOK_APP_ID', getattr(settings, 'FACEBOOK_APP_ID', ''))
    app_secret = os.environ.get('FACEBOOK_APP_SECRET', getattr(settings, 'FACEBOOK_APP_SECRET', ''))
    missing = [v for v, val in [('FACEBOOK_APP_ID', app_id), ('FACEBOOK_APP_SECRET', app_secret)] if not val]
    if missing:
        return Response(
            {
                'error': (
                    f'Facebook login is not configured on the server. '
                    f'Missing environment variable(s): {", ".join(missing)}. '
                    'Set these in your backend .env file and restart the server.'
                )
            },
            status=503,
        )

    redirect_uri = _google_oauth_redirect_uri(request, '/api/v1/auth/oauth/facebook-login/callback/')
    url = (
        'https://www.facebook.com/v18.0/dialog/oauth'
        f'?client_id={app_id}'
        f'&redirect_uri={quote(redirect_uri, safe="")}'
        f'&scope=email%2Cpublic_profile'
        f'&response_type=code'
    )
    return Response({'auth_url': url})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def facebook_login_callback(request):
    """Handle Facebook OAuth callback and issue workspace tokens."""
    code = request.GET.get('code')
    frontend_origin = _frontend_origin()

    if not code:
        return Response({'error': 'Missing code'}, status=400)

    app_id = os.environ.get('FACEBOOK_APP_ID', getattr(settings, 'FACEBOOK_APP_ID', ''))
    app_secret = os.environ.get('FACEBOOK_APP_SECRET', getattr(settings, 'FACEBOOK_APP_SECRET', ''))
    redirect_uri = _google_oauth_redirect_uri(request, '/api/v1/auth/oauth/facebook-login/callback/')

    with httpx.Client(timeout=30) as client:
        token_resp = client.get(
            'https://graph.facebook.com/v18.0/oauth/access_token',
            params={
                'client_id': app_id,
                'client_secret': app_secret,
                'redirect_uri': redirect_uri,
                'code': code,
            },
        )
        token_data = token_resp.json()
        access_token = token_data.get('access_token')

        if not access_token:
            return Response({'error': f'Token exchange failed: {token_data}'}, status=400)

        userinfo_resp = client.get(
            'https://graph.facebook.com/v18.0/me',
            params={'fields': 'id,name,email,first_name,last_name', 'access_token': access_token},
        )
        userinfo = userinfo_resp.json()

    email = str(userinfo.get('email') or '').strip().lower()
    if not email:
        return Response(
            {'error': 'Facebook did not return an email address. Make sure your Facebook account has a verified email.'},
            status=400,
        )

    user = _get_or_create_workspace_account(email)
    user.first_name = str(userinfo.get('first_name') or user.first_name or '').strip()
    user.last_name = str(userinfo.get('last_name') or user.last_name or '').strip()
    user.save(update_fields=['first_name', 'last_name'])

    payload = {
        'type': 'socialmind-facebook-auth',
        **_issue_tokens_for_user(user),
    }

    html = f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Signing you in...</title>
  </head>
  <body>
    <script>
      (function() {{
        const payload = {json.dumps(payload)};
        const targetOrigin = {json.dumps(frontend_origin)};
        if (window.opener) {{
          window.opener.postMessage(payload, targetOrigin);
          window.close();
        }} else {{
          try {{ localStorage.setItem('__sm_facebook_auth__', JSON.stringify(payload)); }} catch(e) {{}}
          document.body.innerHTML = '<p>Authentication complete. You can close this window.</p>';
        }}
      }})();
    </script>
  </body>
</html>
"""
    return HttpResponse(html, content_type='text/html')

