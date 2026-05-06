# File Upload Security

## Overview

HASpoolManager implements defense-in-depth validation for all file uploads to prevent malicious file attacks, including:

- **Photo uploads** (`/api/v1/prints/[id]/photos`)
- **3MF model uploads** (`/api/v1/models`)

## Security Layers

### 1. MIME Type Validation

First line of defense: check the `Content-Type` header from the browser.

**Allowed MIME types for images:**
- `image/jpeg`, `image/jpg`
- `image/png`
- `image/webp`
- `image/gif`

**Allowed MIME types for 3MF:**
- `model/3mf`
- `application/vnd.ms-package.3dmanufacturing-3dmodel+xml`
- `application/x-3mf`
- `application/zip`
- `application/octet-stream`

### 2. Magic Bytes Validation

Critical defense: verify actual file content matches declared type by checking file signatures (magic bytes).

**Image signatures:**
```
PNG:  89 50 4E 47 0D 0A 1A 0A
JPEG: FF D8 FF
WEBP: 52 49 46 46 ... 57 45 42 50 (RIFF...WEBP)
GIF:  47 49 46 38 [37|39] 61 (GIF87a or GIF89a)
```

**3MF signatures:**
```
ZIP:  50 4B 03 04 (3MF files are ZIP archives)
```

**Blocked signatures:**
```
EXE:  4D 5A (Windows executable)
ELF:  7F 45 4C 46 (Linux executable)
```

### 3. MIME Type Mismatch Detection

If declared MIME type doesn't match detected file type → **REJECT**.

Example attack prevented:
```
Declared: image/png
Actual:   image/jpeg (detected from magic bytes)
Result:   REJECTED - MIME type mismatch
```

### 4. File Size Limits

**Photos:** 10 MB maximum (`MAX_PHOTO_BYTES`)  
**3MF models:** 150 MB maximum (`MAX_3MF_BYTES`)

### 5. Filename Sanitization

Prevents directory traversal and path injection attacks:

```typescript
sanitizeFilename("../../../etc/passwd")
// Returns: "_.._.._etc_passwd"

sanitizeFilename("path/to/file.jpg")
// Returns: "path_to_file.jpg"
```

**Sanitization rules:**
- Replace path separators (`/`, `\`) with underscores
- Remove null bytes (`\0`)
- Remove control characters (`\x00-\x1F`, `\x7F`)
- Remove leading dots (`.htaccess` → `htaccess`)
- Trim whitespace
- Limit to 255 characters

### 6. Extension Validation

For 3MF uploads, verify file extension matches expected type:

```typescript
validateExtension("model.3mf", ["3mf"]) // ✓ true
validateExtension("model.exe", ["3mf"]) // ✗ false
```

### 7. Suspicious Content Detection

Additional checks for embedded malicious content:

- **Script tags:** `<script>` (XSS in SVG/HTML)
- **Executables:** MZ header (Windows), ELF header (Linux)

Only checks first 1024 bytes for performance.

## Implementation

### Core Module: `lib/file-validator.ts`

```typescript
import { validateImageUpload, sanitizeFilename } from "@/lib/file-validator";

// Validate image
const buffer = Buffer.from(await file.arrayBuffer());
const validation = validateImageUpload(buffer, file.type, MAX_SIZE);

if (!validation.valid) {
  return NextResponse.json({ error: validation.error }, { status: 400 });
}

// Use validated extension (from magic bytes, not user input)
const ext = validation.extension!;
```

### Photo Upload Endpoint

**File:** `app/api/v1/prints/[id]/photos/route.ts`

**Security measures:**
1. Sanitize filename
2. Read file buffer
3. Validate with `validateImageUpload()`
4. Use detected extension (not declared)
5. Save with validated parameters

### 3MF Upload Endpoint

**File:** `app/api/v1/models/route.ts`

**Security measures:**
1. Sanitize filename
2. Validate extension is `.3mf`
3. Read file buffer
4. Validate with `validate3MFUpload()` (checks ZIP format)
5. Parse 3MF structure (additional validation in `lib/3mf-parser.ts`)

## Attack Scenarios Prevented

### 1. Executable Disguised as Image

**Attack:**
```
Upload: malware.exe
Declared MIME: image/png
Magic bytes: 4D 5A (Windows EXE)
```

**Defense:**
- Magic bytes detection identifies EXE signature
- MIME type mismatch detected
- Upload rejected

### 2. Path Traversal

**Attack:**
```
Filename: ../../../etc/passwd
Goal: Overwrite system files
```

**Defense:**
- Filename sanitization replaces `/` with `_`
- Result: `_.._.._etc_passwd`
- Saved in isolated directory

### 3. MIME Type Spoofing

**Attack:**
```
Upload: shell.php
Declared MIME: image/jpeg
Magic bytes: <?php (PHP script)
```

**Defense:**
- Magic bytes don't match JPEG signature
- File type detection fails
- Upload rejected

### 4. Polyglot Files

**Attack:**
```
File contains both valid image and executable code
Goal: Bypass validation, execute on server
```

**Defense:**
- Magic bytes validation ensures file starts correctly
- Suspicious content detection checks for embedded scripts
- File served with correct MIME type (prevents execution)

### 5. Zip Bomb (3MF)

**Attack:**
```
Upload: tiny.3mf (1 KB compressed)
Expands to: 10 GB uncompressed
Goal: Exhaust disk space
```

**Defense:**
- Size limit enforced before decompression (150 MB)
- Parser validates structure before full extraction

## Testing

**Test file:** `tests/unit/file-validator.test.ts`

**Coverage:** 53 tests covering:
- Magic bytes detection (8 tests)
- Image validation (12 tests)
- 3MF validation (9 tests)
- Filename sanitization (8 tests)
- Extension validation (5 tests)
- MIME type mapping (3 tests)
- Suspicious content detection (7 tests)

**Run tests:**
```bash
npm test -- tests/unit/file-validator.test.ts
```

## Best Practices

### For Developers

1. **Always validate on server-side** - Never trust client-side validation
2. **Use magic bytes** - Don't rely solely on MIME types or extensions
3. **Sanitize filenames** - Prevent path traversal attacks
4. **Enforce size limits** - Prevent DoS via large uploads
5. **Serve with correct MIME** - Use `getSafeMimeType()` when serving files

### For Operators

1. **Monitor upload logs** - Watch for rejected uploads (potential attacks)
2. **Review file storage** - Ensure uploads are isolated from system files
3. **Set appropriate limits** - Adjust `MAX_PHOTO_BYTES` and `MAX_3MF_BYTES` based on needs
4. **Regular backups** - Protect against data loss from attacks

## References

- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [File Signatures (Magic Bytes)](https://en.wikipedia.org/wiki/List_of_file_signatures)
- [CWE-434: Unrestricted Upload of File with Dangerous Type](https://cwe.mitre.org/data/definitions/434.html)
- [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)

## Related Documentation

- [SSRF Protection](./ssrf-protection.md) - URL validation for price crawler
- [API Key Management](./api-key-management.md) - Authentication security
- [Audit Logging](./audit-logging.md) - SQL operation tracking