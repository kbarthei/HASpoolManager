# SSRF Protection

## Overview

The price crawler includes comprehensive Server-Side Request Forgery (SSRF) protection to prevent attackers from using the application to access internal services, cloud metadata endpoints, or perform port scanning.

## Attack Vectors Blocked

### 1. Private IP Addresses (RFC 1918)

**Blocked Ranges:**
- `127.0.0.0/8` - Loopback (localhost)
- `10.0.0.0/8` - Private Class A
- `172.16.0.0/12` - Private Class B
- `192.168.0.0/16` - Private Class C
- `169.254.0.0/16` - Link-local (APIPA)
- `0.0.0.0/8` - Current network
- `224.0.0.0/4` - Multicast
- `240.0.0.0/4` - Reserved
- `255.255.255.255` - Broadcast

**Example Blocked URLs:**
```
http://127.0.0.1/admin
http://192.168.1.1/router-config
http://10.0.0.5:8080/internal-api
```

### 2. Cloud Metadata Endpoints

**Blocked Hostnames:**
- `169.254.169.254` - AWS/Azure metadata service
- `metadata.google.internal` - GCP metadata service
- `metadata` - Generic metadata hostname
- `localhost` - All localhost variations

**Example Attack:**
```bash
# Attacker tries to steal AWS credentials
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

### 3. IPv6 Private Addresses

**Blocked Ranges:**
- `::1` - IPv6 loopback
- `fe80::/10` - IPv6 link-local
- `fc00::/7` - IPv6 unique local (ULA)

**Example Blocked URLs:**
```
http://[::1]/admin
http://[fe80::1]/router
http://[fc00::1]/internal
```

### 4. Non-HTTP Protocols

**Blocked Protocols:**
- `file://` - Local file access
- `ftp://` - FTP protocol
- `gopher://` - Gopher protocol
- `javascript:` - JavaScript execution
- `data:` - Data URIs

**Example Attacks:**
```
file:///etc/passwd
ftp://internal-server/sensitive-data
javascript:alert(document.cookie)
```

### 5. Non-Standard Ports

**Allowed Ports:** 80 (HTTP), 443 (HTTPS)

**Blocked:** All other ports to prevent port scanning

**Example Blocked URLs:**
```
https://store.bambulab.com:8080/admin
http://3djake.de:3000/internal-api
https://amazon.de:9999/backdoor
```

### 6. Unknown Domains

**Protection:** Domain allowlist - only known legitimate shops are allowed

**Blocked:** Any domain not in the allowlist

**Example Blocked URLs:**
```
https://evil.com/phishing
https://attacker.net/malware
https://random-shop.xyz/fake-products
```

## Implementation

### URL Validation (`lib/url-validator.ts`)

```typescript
import { validateURL } from "@/lib/url-validator";

const result = validateURL("https://store.bambulab.com/products/pla");

if (result.valid) {
  // Safe to fetch
  const response = await fetch(result.sanitizedUrl);
} else {
  // Blocked - log the error
  console.warn(`Blocked URL: ${result.error}`);
}
```

### Price Crawler (`lib/price-crawler.ts`)

The price crawler includes multiple layers of protection:

1. **URL Validation** - Pre-flight check before fetch
2. **Timeout Protection** - 10 second max per request
3. **Response Size Limit** - 5 MB max to prevent memory exhaustion
4. **User-Agent Header** - Identifies the bot for rate limiting

```typescript
// Security limits
const FETCH_TIMEOUT_MS = 10_000;      // 10 seconds
const MAX_RESPONSE_SIZE = 5_000_000;  // 5 MB

// Validate before fetching
const validation = validateURL(url);
if (!validation.valid) {
  return { price: null, error: validation.error };
}

// Fetch with timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

const response = await fetch(sanitizedUrl, {
  signal: controller.signal,
  headers: {
    "User-Agent": "HASpoolManager/1.0 (Filament Price Crawler)",
  },
});
```

### API Endpoint (`/api/v1/prices/refresh`)

The refresh endpoint validates all URLs from the database before fetching:

```typescript
// Pre-validate URL before attempting fetch
const validation = validateURL(listing.productUrl);
if (!validation.valid) {
  console.warn(`Skipping invalid URL: ${validation.error}`);
  skipped++;
  continue;
}

const result = await fetchProductPrice(listing.productUrl);
```

## Allowed Domains

The following shop domains are in the allowlist:

- `bambulab.com` (and all subdomains)
- `3djake.com`, `3djake.de`, `3djake.at`, `3djake.ch`
- `amazon.com`, `amazon.de`, `amazon.co.uk`
- `prusa3d.com`, `shop.prusa3d.com`
- `polymaker.com`
- `matterhackers.com`
- `filamentum.com`
- `extrudr.com`
- `fiberlogy.com`
- `formfutura.com`
- `colorfabb.com`
- `prusament.com`

### Adding New Domains

To add a legitimate shop domain:

1. Edit `lib/url-validator.ts`
2. Add domain to `ALLOWED_DOMAINS` array
3. Run tests: `npm run test:unit tests/unit/url-validator.test.ts`
4. Document the addition in this file

```typescript
const ALLOWED_DOMAINS = [
  // ... existing domains
  "newshop.com",  // Added: 2026-05-06 - Legitimate filament vendor
] as const;
```

## Security Considerations

### Defense in Depth

Multiple layers of protection ensure security even if one layer fails:

1. **URL Validation** - First line of defense
2. **Timeout Protection** - Prevents hanging requests
3. **Size Limits** - Prevents memory exhaustion
4. **Domain Allowlist** - Restricts to known shops
5. **Protocol Restriction** - Only HTTP/HTTPS
6. **Port Restriction** - Only 80/443

### Credential Stripping

URLs with embedded credentials are sanitized:

```typescript
// Input:  https://user:pass@store.bambulab.com/products
// Output: https://store.bambulab.com/products
```

### DNS Rebinding Protection

The domain allowlist prevents DNS rebinding attacks where a domain initially resolves to a legitimate IP but later changes to a private IP.

### Rate Limiting

The price crawler includes a custom User-Agent header to enable rate limiting at the shop level:

```
User-Agent: HASpoolManager/1.0 (Filament Price Crawler)
```

## Testing

### Unit Tests

Run the comprehensive test suite:

```bash
npm run test:unit tests/unit/url-validator.test.ts
```

**Test Coverage:**
- ✅ Valid shop URLs (accepted)
- ✅ Private IP addresses (blocked)
- ✅ Localhost variations (blocked)
- ✅ Cloud metadata endpoints (blocked)
- ✅ Link-local addresses (blocked)
- ✅ IPv6 loopback/link-local (blocked)
- ✅ Non-HTTP protocols (blocked)
- ✅ Non-standard ports (blocked)
- ✅ Unknown domains (blocked)
- ✅ Credential stripping (sanitized)
- ✅ Subdomains of allowed domains (accepted)

### Manual Testing

Test the price refresh endpoint:

```bash
# Valid URL - should succeed
curl -X POST http://localhost:3000/api/v1/prices/refresh \
  -H "Content-Type: application/json" \
  -d '{"filamentId": "some-id"}'

# Check logs for any blocked URLs
docker logs haspoolmanager | grep "Blocked URL"
```

## Monitoring

### Logging

All blocked URLs are logged with the reason:

```
[price-crawler] Blocked URL: http://127.0.0.1/admin - Private IP address 127.0.0.1 is blocked
[prices/refresh] Skipping invalid URL for listing abc-123: Domain evil.com is not in allowlist
```

### Metrics

The `/api/v1/prices/refresh` endpoint returns:

```json
{
  "refreshed": 10,
  "skipped": 2,
  "total": 12,
  "results": [
    {
      "listingId": "...",
      "url": "...",
      "price": 19.99,
      "error": null
    },
    {
      "listingId": "...",
      "url": "http://127.0.0.1/",
      "price": null,
      "error": "Private IP address 127.0.0.1 is blocked"
    }
  ]
}
```

## Incident Response

### If SSRF Attack Detected

1. **Check audit logs** for the source of malicious URLs:
   ```sql
   SELECT * FROM audit_logs 
   WHERE sql_statement LIKE '%shop_listings%'
   ORDER BY created_at DESC LIMIT 50;
   ```

2. **Identify affected listings**:
   ```sql
   SELECT id, product_url, filament_id 
   FROM shop_listings 
   WHERE product_url NOT LIKE 'https://store.bambulab.com%'
     AND product_url NOT LIKE 'https://3djake%'
     AND product_url NOT LIKE 'https://amazon%';
   ```

3. **Remove malicious URLs**:
   ```sql
   UPDATE shop_listings 
   SET is_active = 0 
   WHERE id IN ('suspicious-id-1', 'suspicious-id-2');
   ```

4. **Review order parsing logs** - check if AI order parser was exploited

5. **Rotate API keys** if compromise suspected

## Future Enhancements

Potential improvements:

- [ ] Rate limiting per domain (max 10 requests/minute)
- [ ] Caching of validation results (TTL: 1 hour)
- [ ] Webhook notifications for blocked URLs
- [ ] Integration with threat intelligence feeds
- [ ] Automatic domain reputation checking
- [ ] Support for custom domain allowlists per user
- [ ] DNS resolution validation (check resolved IP before fetch)

## References

- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [RFC 1918 - Private Address Space](https://datatracker.ietf.org/doc/html/rfc1918)
- [AWS SSRF Protection](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html)
- [PortSwigger SSRF Guide](https://portswigger.net/web-security/ssrf)