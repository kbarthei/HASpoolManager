# API Key Management

## Overview

HASpoolManager uses API keys for authentication of external integrations (Home Assistant webhooks, automation scripts, etc.). API keys support expiration and rotation for enhanced security.

## Key Features

- **Expiration Support** - Keys can expire after a configurable period (default: 90 days)
- **Never-Expire Option** - Keys can be set to never expire (use sparingly)
- **Automatic Cleanup** - Expired keys can be automatically deactivated
- **Key Rotation** - Replace old keys with new ones while preserving permissions
- **Usage Tracking** - Last-used timestamp for each key
- **Prefix Display** - First 12 characters shown for identification (full key never stored)

## Security Model

### Key Storage

- **Raw Key**: Generated once, shown to user, never stored
- **Key Hash**: bcrypt hash (cost factor 12) stored in database
- **Key Prefix**: First 12 characters stored for identification (e.g., `hspm_a1b2c3d4`)

### Verification Process

1. Check key format (must start with `hspm_`)
2. Query active keys that haven't expired
3. Compare provided key against stored hashes (bcrypt)
4. Double-check expiration (defense in depth)
5. Update last-used timestamp

### Expiration Logic

Keys are considered expired when:
- `expires_at` is not null AND
- `expires_at` < current time

Expired keys are automatically excluded from authentication queries.

## API Endpoints

### List API Keys

```http
GET /api/v1/admin/api-keys
Authorization: Bearer <token>
```

**Response:**
```json
{
  "keys": [
    {
      "id": "key-uuid",
      "name": "HA Integration",
      "keyPrefix": "hspm_a1b2c3d4",
      "isActive": true,
      "expiresAt": "2026-08-04T10:00:00.000Z",
      "lastUsedAt": "2026-05-06T09:30:00.000Z",
      "createdAt": "2026-05-06T08:00:00.000Z",
      "isExpired": false,
      "daysUntilExpiry": 90
    }
  ]
}
```

### Create API Key

```http
POST /api/v1/admin/api-keys
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "HA Integration",
  "expiresInDays": 90  // or null for never expires
}
```

**Response:**
```json
{
  "key": {
    "id": "key-uuid",
    "name": "HA Integration",
    "keyPrefix": "hspm_a1b2c3d4",
    "expiresAt": "2026-08-04T10:00:00.000Z",
    "createdAt": "2026-05-06T10:00:00.000Z"
  },
  "rawKey": "hspm_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
  "warning": "Save this key now - it will not be shown again"
}
```

⚠️ **Important**: The `rawKey` is shown only once. Save it immediately.

### Rotate API Key

```http
POST /api/v1/admin/api-keys/rotate
Authorization: Bearer <token>
Content-Type: application/json

{
  "keyId": "old-key-uuid",
  "expiresInDays": 90  // or null for never expires
}
```

**Response:**
```json
{
  "oldKeyId": "old-key-uuid",
  "newKeyId": "new-key-uuid",
  "keyPrefix": "hspm_z9y8x7w6",
  "expiresAt": "2026-08-04T10:00:00.000Z",
  "rawKey": "hspm_z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4",
  "warning": "Save this key now - it will not be shown again. The old key has been deactivated."
}
```

**What Happens:**
1. New key created with same name and permissions
2. Old key immediately deactivated
3. New raw key returned (save it!)

### Deactivate API Key

```http
DELETE /api/v1/admin/api-keys?id=<key-id>
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true
}
```

### List Expired Keys

```http
GET /api/v1/admin/api-keys/cleanup
Authorization: Bearer <token>
```

**Response:**
```json
{
  "count": 2,
  "keys": [
    {
      "id": "key-uuid-1",
      "name": "Old Integration",
      "keyPrefix": "hspm_old12345",
      "expiresAt": "2026-04-01T00:00:00.000Z",
      "lastUsedAt": "2026-03-15T10:00:00.000Z"
    }
  ]
}
```

### Cleanup Expired Keys

```http
POST /api/v1/admin/api-keys/cleanup
Authorization: Bearer <token>
```

**Response:**
```json
{
  "deactivated": 2,
  "message": "Deactivated 2 expired keys"
}
```

## Usage Patterns

### Initial Setup

```bash
# Create a key for Home Assistant integration
curl -X POST http://localhost:3000/api/v1/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Home Assistant",
    "expiresInDays": 90
  }'

# Save the returned rawKey to HA secrets.yaml
```

### Regular Rotation (Every 90 Days)

```bash
# List keys to find the one to rotate
curl http://localhost:3000/api/v1/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_KEY"

# Rotate the key
curl -X POST http://localhost:3000/api/v1/admin/api-keys/rotate \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "keyId": "old-key-uuid",
    "expiresInDays": 90
  }'

# Update HA secrets.yaml with new key
# Restart HA to pick up new key
```

### Automated Cleanup (Cron Job)

```bash
#!/bin/bash
# Run daily to deactivate expired keys

curl -X POST http://localhost:3000/api/v1/admin/api-keys/cleanup \
  -H "Authorization: Bearer $ADMIN_KEY"
```

Add to crontab:
```cron
0 2 * * * /path/to/cleanup-expired-keys.sh
```

## Best Practices

### Key Expiration

✅ **DO:**
- Set expiration for all keys (default: 90 days)
- Rotate keys before they expire
- Use calendar reminders for rotation
- Document key rotation schedule

❌ **DON'T:**
- Create never-expiring keys unless absolutely necessary
- Let keys expire without rotation (breaks integrations)
- Share keys between multiple integrations
- Store keys in version control

### Key Naming

Use descriptive names that indicate:
- **Purpose**: "HA Webhook", "Automation Script", "Monitoring"
- **Owner**: "Production HA", "Dev Environment"
- **Scope**: "Read-Only", "Full Access"

**Examples:**
- ✅ "HA Production - Printer Sync"
- ✅ "Automation - Nightly Backup"
- ✅ "Monitoring - Read-Only"
- ❌ "key1"
- ❌ "test"

### Rotation Schedule

| Key Type | Rotation Frequency | Expiration |
|----------|-------------------|------------|
| Production HA Integration | 90 days | 90 days |
| Development/Testing | 30 days | 30 days |
| Automation Scripts | 90 days | 90 days |
| Emergency/Temporary | 7 days | 7 days |

### Security Checklist

- [ ] All keys have expiration set
- [ ] Keys are rotated before expiration
- [ ] Expired keys are cleaned up monthly
- [ ] Key usage is monitored (lastUsedAt)
- [ ] Unused keys are deactivated
- [ ] Keys are stored in secure secrets management
- [ ] Key rotation is documented and scheduled

## Monitoring

### Check Key Status

```bash
# List all keys with expiration info
curl http://localhost:3000/api/v1/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  | jq '.keys[] | {name, isExpired, daysUntilExpiry, lastUsedAt}'
```

### Find Keys Expiring Soon

```bash
# Keys expiring in next 7 days
curl http://localhost:3000/api/v1/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  | jq '.keys[] | select(.daysUntilExpiry != null and .daysUntilExpiry <= 7)'
```

### Find Unused Keys

```bash
# Keys not used in last 30 days
curl http://localhost:3000/api/v1/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  | jq '.keys[] | select(.lastUsedAt == null or (.lastUsedAt | fromdateiso8601) < (now - 2592000))'
```

## Troubleshooting

### "Invalid or expired key" Error

**Possible Causes:**
1. Key has expired
2. Key was deactivated
3. Key was never created
4. Wrong key format (must start with `hspm_`)

**Solution:**
```bash
# Check key status
curl http://localhost:3000/api/v1/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_KEY"

# If expired, rotate it
curl -X POST http://localhost:3000/api/v1/admin/api-keys/rotate \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"keyId": "expired-key-id", "expiresInDays": 90}'
```

### Key Rotation Breaks Integration

**Problem**: Old key stops working immediately after rotation.

**Solution**: This is expected behavior. Update the integration with the new key immediately after rotation.

**Best Practice**: Perform rotation during maintenance window.

### Lost API Key

**Problem**: Raw key was not saved after creation.

**Solution**: Keys cannot be recovered. Create a new key or rotate the existing one:

```bash
# Rotate to get a new raw key
curl -X POST http://localhost:3000/api/v1/admin/api-keys/rotate \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"keyId": "lost-key-id", "expiresInDays": 90}'
```

## Migration from Old Keys

If you have existing keys without expiration:

```bash
# 1. List all keys
curl http://localhost:3000/api/v1/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_KEY"

# 2. Rotate each key to add expiration
for key_id in $(curl -s http://localhost:3000/api/v1/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  | jq -r '.keys[] | select(.expiresAt == null) | .id'); do
  
  echo "Rotating key: $key_id"
  curl -X POST http://localhost:3000/api/v1/admin/api-keys/rotate \
    -H "Authorization: Bearer $ADMIN_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"keyId\": \"$key_id\", \"expiresInDays\": 90}"
done
```

## Environment Variable Keys

The `API_SECRET_KEY` environment variable provides a fallback authentication method:

- **Purpose**: Bootstrap access, emergency recovery
- **Expiration**: Never expires (managed externally)
- **Rotation**: Update `.env` file and restart addon
- **Best Practice**: Use database keys for normal operations

**When to use:**
- Initial setup before database keys exist
- Emergency access if all database keys are lost
- Automated deployment scripts

**When NOT to use:**
- Regular Home Assistant integration (use database keys)
- Multiple integrations (create separate database keys)
- Production workloads (prefer database keys with expiration)

## Future Enhancements

Potential improvements:

- [ ] Automatic rotation reminders (email/notification)
- [ ] Key permissions/scopes (read-only, write-only, admin)
- [ ] Rate limiting per key
- [ ] Key usage analytics (requests per day)
- [ ] Audit log integration (track all key operations)
- [ ] Bulk key operations (rotate all, cleanup all)
- [ ] Key templates (pre-configured expiration policies)
- [ ] Integration with external secrets managers (Vault, AWS Secrets Manager)

## References

- [bcrypt](https://en.wikipedia.org/wiki/Bcrypt) - Password hashing function
- [API Key Best Practices](https://cloud.google.com/docs/authentication/api-keys)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)