# nginx Reverse Proxy Configuration

## Overview

This guide covers nginx configuration for HASpoolManager, including reverse proxy setup, SSL/TLS, rate limiting, and security headers.

## Basic Reverse Proxy Setup

### Standalone Deployment

For HASpoolManager running directly on a server (not as Home Assistant addon):

```nginx
# /etc/nginx/sites-available/haspoolmanager
server {
    listen 80;
    server_name haspoolmanager.example.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name haspoolmanager.example.com;
    
    # SSL Configuration (see SSL/TLS section below)
    ssl_certificate /etc/letsencrypt/live/haspoolmanager.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/haspoolmanager.example.com/privkey.pem;
    
    # Proxy to HASpoolManager
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffering
        proxy_buffering off;
        proxy_request_buffering off;
    }
    
    # Health check endpoint (no auth required)
    location /api/v1/health {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;  # Don't log health checks
    }
    
    # Static files (if serving from nginx)
    location /_next/static {
        proxy_pass http://localhost:3002;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Home Assistant Addon (Ingress)

For HASpoolManager running as a Home Assistant addon with ingress:

```nginx
# /etc/nginx/conf.d/homeassistant.conf
server {
    listen 443 ssl http2;
    server_name homeassistant.example.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/homeassistant.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/homeassistant.example.com/privkey.pem;
    
    # Home Assistant
    location / {
        proxy_pass http://localhost:8123;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # HASpoolManager addon (via HA ingress)
    # Accessible at: https://homeassistant.example.com/api/hassio_ingress/<token>/
    # No additional nginx config needed - HA handles ingress routing
}
```

## SSL/TLS Configuration

### Let's Encrypt with Certbot

**Install Certbot:**
```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx
```

**Obtain Certificate:**
```bash
sudo certbot --nginx -d haspoolmanager.example.com
```

**Auto-renewal:**
```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot installs a systemd timer automatically
sudo systemctl status certbot.timer
```

### SSL Configuration (Modern)

```nginx
# Strong SSL configuration (Mozilla Modern profile)
ssl_protocols TLSv1.3;
ssl_prefer_server_ciphers off;

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
ssl_trusted_certificate /etc/letsencrypt/live/haspoolmanager.example.com/chain.pem;
resolver 1.1.1.1 1.0.0.1 valid=300s;
resolver_timeout 5s;

# SSL Session Cache
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;

# HSTS (HTTP Strict Transport Security)
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

### SSL Configuration (Intermediate - Broader Compatibility)

```nginx
# Intermediate SSL configuration (Mozilla Intermediate profile)
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
ssl_prefer_server_ciphers off;

# Diffie-Hellman parameters (generate with: openssl dhparam -out /etc/nginx/dhparam.pem 2048)
ssl_dhparam /etc/nginx/dhparam.pem;
```

## Security Headers

### Recommended Headers

```nginx
# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

# Content Security Policy (adjust based on your needs)
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self';" always;

# HSTS (already covered in SSL section)
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

### Header Explanations

- **X-Frame-Options**: Prevents clickjacking attacks
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **X-XSS-Protection**: Enables browser XSS protection
- **Referrer-Policy**: Controls referrer information
- **Permissions-Policy**: Controls browser features
- **Content-Security-Policy**: Prevents XSS and injection attacks
- **Strict-Transport-Security**: Forces HTTPS connections

## Rate Limiting

### Basic Rate Limiting

```nginx
# Define rate limit zones (add to http block)
http {
    # General API rate limit: 10 requests per second per IP
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    
    # Auth endpoints: 5 requests per minute per IP
    limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;
    
    # File uploads: 2 requests per minute per IP
    limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=2r/m;
    
    server {
        # ... SSL config ...
        
        # Apply rate limiting to API endpoints
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;
            limit_req_status 429;
            
            proxy_pass http://localhost:3002;
            # ... proxy config ...
        }
        
        # Stricter rate limiting for auth endpoints
        location /api/v1/auth/ {
            limit_req zone=auth_limit burst=5 nodelay;
            limit_req_status 429;
            
            proxy_pass http://localhost:3002;
            # ... proxy config ...
        }
        
        # Rate limit file uploads
        location ~ ^/api/v1/(prints|models)/.*/photos {
            limit_req zone=upload_limit burst=2 nodelay;
            limit_req_status 429;
            
            # Increase body size limit for uploads
            client_max_body_size 150M;
            
            proxy_pass http://localhost:3002;
            # ... proxy config ...
        }
    }
}
```

### Advanced Rate Limiting (Per-User)

```nginx
# Rate limit by API key (requires custom logic)
map $http_authorization $api_key {
    default "";
    "~^Bearer (.+)$" $1;
}

limit_req_zone $api_key zone=user_api_limit:10m rate=100r/s;

location /api/ {
    limit_req zone=user_api_limit burst=200 nodelay;
    proxy_pass http://localhost:3002;
}
```

### Custom Error Page for Rate Limiting

```nginx
# Custom 429 error page
error_page 429 /429.html;
location = /429.html {
    root /var/www/errors;
    internal;
}
```

**Create `/var/www/errors/429.html`:**
```html
<!DOCTYPE html>
<html>
<head>
    <title>Rate Limit Exceeded</title>
</head>
<body>
    <h1>429 Too Many Requests</h1>
    <p>You have exceeded the rate limit. Please try again later.</p>
</body>
</html>
```

## Request Size Limits

```nginx
# Default body size limit (for most requests)
client_max_body_size 10M;

# Larger limit for file uploads
location ~ ^/api/v1/(prints|models)/.*/photos {
    client_max_body_size 150M;
    proxy_pass http://localhost:3002;
}

# Smaller limit for JSON API requests
location /api/v1/ {
    client_max_body_size 1M;
    proxy_pass http://localhost:3002;
}
```

## Logging

### Access Logs

```nginx
# Custom log format with timing information
log_format detailed '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';

server {
    # Separate log files for different purposes
    access_log /var/log/nginx/haspoolmanager-access.log detailed;
    error_log /var/log/nginx/haspoolmanager-error.log warn;
    
    # Don't log health checks
    location /api/v1/health {
        access_log off;
        proxy_pass http://localhost:3002;
    }
}
```

### Log Rotation

```bash
# /etc/logrotate.d/nginx-haspoolmanager
/var/log/nginx/haspoolmanager-*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
    endscript
}
```

## Caching

### Static Asset Caching

```nginx
# Cache Next.js static assets
location /_next/static {
    proxy_pass http://localhost:3002;
    proxy_cache_valid 200 1y;
    add_header Cache-Control "public, immutable";
    expires 1y;
}

# Cache images
location ~* \.(jpg|jpeg|png|gif|ico|webp)$ {
    proxy_pass http://localhost:3002;
    proxy_cache_valid 200 30d;
    add_header Cache-Control "public, max-age=2592000";
    expires 30d;
}
```

### API Response Caching (Use with Caution)

```nginx
# Cache GET requests to read-only endpoints
proxy_cache_path /var/cache/nginx/haspoolmanager levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=60m;

location /api/v1/filaments {
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_key "$scheme$request_method$host$request_uri";
    proxy_cache_bypass $http_cache_control;
    add_header X-Cache-Status $upstream_cache_status;
    
    proxy_pass http://localhost:3002;
}
```

## Complete Production Configuration

```nginx
# /etc/nginx/sites-available/haspoolmanager-production

# Rate limit zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=2r/m;

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name haspoolmanager.example.com;
    return 301 https://$server_name$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name haspoolmanager.example.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/haspoolmanager.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/haspoolmanager.example.com/privkey.pem;
    ssl_protocols TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/haspoolmanager.example.com/chain.pem;
    resolver 1.1.1.1 1.0.0.1 valid=300s;
    resolver_timeout 5s;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Logging
    access_log /var/log/nginx/haspoolmanager-access.log detailed;
    error_log /var/log/nginx/haspoolmanager-error.log warn;
    
    # Default body size
    client_max_body_size 10M;
    
    # Health check (no rate limit, no logging)
    location /api/v1/health {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }
    
    # File uploads (larger size limit, stricter rate limit)
    location ~ ^/api/v1/(prints|models)/.*/photos {
        limit_req zone=upload_limit burst=2 nodelay;
        client_max_body_size 150M;
        
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
    
    # API endpoints (rate limited)
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        limit_req_status 429;
        
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }
    
    # Static assets (cached)
    location /_next/static {
        proxy_pass http://localhost:3002;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, immutable";
        expires 1y;
    }
    
    # All other requests
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

## Testing Configuration

```bash
# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Check nginx status
sudo systemctl status nginx

# View error logs
sudo tail -f /var/log/nginx/haspoolmanager-error.log

# View access logs
sudo tail -f /var/log/nginx/haspoolmanager-access.log
```

## Troubleshooting

### Common Issues

**502 Bad Gateway:**
- Check HASpoolManager is running: `systemctl status haspoolmanager`
- Check port 3002 is listening: `sudo netstat -tlnp | grep 3002`
- Check firewall rules: `sudo ufw status`

**504 Gateway Timeout:**
- Increase proxy timeouts in nginx config
- Check HASpoolManager logs for slow operations

**413 Request Entity Too Large:**
- Increase `client_max_body_size` in nginx config

**429 Too Many Requests:**
- Adjust rate limit zones
- Check if legitimate traffic is being blocked

### SSL Certificate Issues

```bash
# Check certificate expiry
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Test SSL configuration
openssl s_client -connect haspoolmanager.example.com:443 -servername haspoolmanager.example.com
```

## Related Documentation

- [Installation Guide](./installation.md) - Initial setup
- [Security Best Practices](../architecture/security.md) - Security hardening
- [Monitoring](./monitoring.md) - Health checks and monitoring