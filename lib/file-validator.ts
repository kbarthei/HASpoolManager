/**
 * File validation and security for uploads.
 * 
 * Provides defense-in-depth validation:
 * 1. MIME type checking (from Content-Type header)
 * 2. Magic bytes validation (actual file content)
 * 3. File extension validation
 * 4. Size limits
 * 
 * Prevents attacks where malicious files are disguised with fake MIME types.
 */

// Magic bytes (file signatures) for supported formats
// Reference: https://en.wikipedia.org/wiki/List_of_file_signatures
const MAGIC_BYTES = {
  // Images
  JPEG: [
    [0xFF, 0xD8, 0xFF], // JPEG/JFIF
  ],
  PNG: [
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // PNG
  ],
  WEBP: [
    // WEBP: RIFF....WEBP (check RIFF at start and WEBP at offset 8)
    [0x52, 0x49, 0x46, 0x46], // "RIFF"
  ],
  GIF: [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
  
  // 3D Models
  ZIP: [
    [0x50, 0x4B, 0x03, 0x04], // ZIP (3MF files are ZIP archives)
    [0x50, 0x4B, 0x05, 0x06], // Empty ZIP
    [0x50, 0x4B, 0x07, 0x08], // Spanned ZIP
  ],
} as const;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedType?: string;
  mimeType?: string;
  extension?: string;
}

/**
 * Check if buffer starts with any of the given magic byte sequences.
 */
function matchesMagicBytes(buffer: Buffer, signatures: readonly (readonly number[])[]): boolean {
  return signatures.some(sig => {
    if (buffer.length < sig.length) return false;
    return sig.every((byte, i) => buffer[i] === byte);
  });
}

/**
 * Detect file type from magic bytes.
 * Returns null if no known type matches.
 */
export function detectFileType(buffer: Buffer): string | null {
  if (matchesMagicBytes(buffer, MAGIC_BYTES.PNG)) return "image/png";
  if (matchesMagicBytes(buffer, MAGIC_BYTES.JPEG)) return "image/jpeg";
  if (matchesMagicBytes(buffer, MAGIC_BYTES.GIF)) return "image/gif";
  
  // WEBP: check RIFF at start and WEBP at offset 8
  if (matchesMagicBytes(buffer, MAGIC_BYTES.WEBP)) {
    if (buffer.length >= 12) {
      const webpSig = buffer.slice(8, 12).toString('ascii');
      if (webpSig === 'WEBP') return "image/webp";
    }
  }
  
  // ZIP (3MF files)
  if (matchesMagicBytes(buffer, MAGIC_BYTES.ZIP)) return "application/zip";
  
  return null;
}

/**
 * Validate an image file upload.
 * Checks: MIME type, magic bytes, size limit.
 */
export function validateImageUpload(
  buffer: Buffer,
  declaredMimeType: string,
  maxSizeBytes: number
): FileValidationResult {
  // Size check
  if (buffer.length > maxSizeBytes) {
    return {
      valid: false,
      error: `File too large: ${buffer.length} bytes > ${maxSizeBytes} bytes`,
    };
  }

  // Empty file check
  if (buffer.length === 0) {
    return {
      valid: false,
      error: "Empty file",
    };
  }

  // Declared MIME type check
  const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/jpg", // Some browsers use jpg instead of jpeg
    "image/png",
    "image/webp",
    "image/gif",
  ]);

  if (!allowedMimeTypes.has(declaredMimeType)) {
    return {
      valid: false,
      error: `Unsupported MIME type: ${declaredMimeType}`,
      mimeType: declaredMimeType,
    };
  }

  // Magic bytes validation
  const detectedType = detectFileType(buffer);
  if (!detectedType) {
    return {
      valid: false,
      error: "Could not detect file type from content (invalid or corrupted file)",
      mimeType: declaredMimeType,
    };
  }

  // Normalize MIME types for comparison (jpeg vs jpg)
  const normalizedDeclared = declaredMimeType.replace("image/jpg", "image/jpeg");
  const normalizedDetected = detectedType.replace("image/jpg", "image/jpeg");

  // MIME type must match magic bytes
  if (normalizedDeclared !== normalizedDetected) {
    return {
      valid: false,
      error: `MIME type mismatch: declared ${declaredMimeType} but file content is ${detectedType}`,
      mimeType: declaredMimeType,
      detectedType,
    };
  }

  // Determine file extension
  const extension = detectedType === "image/png" ? "png"
    : detectedType === "image/webp" ? "webp"
    : detectedType === "image/gif" ? "gif"
    : "jpg";

  return {
    valid: true,
    detectedType,
    mimeType: declaredMimeType,
    extension,
  };
}

/**
 * Validate a 3MF file upload.
 * 3MF files are ZIP archives with specific structure.
 */
export function validate3MFUpload(
  buffer: Buffer,
  declaredMimeType: string,
  maxSizeBytes: number
): FileValidationResult {
  // Size check
  if (buffer.length > maxSizeBytes) {
    return {
      valid: false,
      error: `File too large: ${buffer.length} bytes > ${maxSizeBytes} bytes`,
    };
  }

  // Empty file check
  if (buffer.length === 0) {
    return {
      valid: false,
      error: "Empty file",
    };
  }

  // Declared MIME type check (3MF can be declared as various types)
  const allowedMimeTypes = new Set([
    "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
    "model/3mf",
    "application/x-3mf",
    "application/zip",
    "application/octet-stream", // Some browsers use generic type
  ]);

  if (!allowedMimeTypes.has(declaredMimeType)) {
    return {
      valid: false,
      error: `Unsupported MIME type for 3MF: ${declaredMimeType}`,
      mimeType: declaredMimeType,
    };
  }

  // Magic bytes validation - must be a ZIP file
  const detectedType = detectFileType(buffer);
  if (detectedType !== "application/zip") {
    return {
      valid: false,
      error: "File is not a valid ZIP archive (3MF files must be ZIP format)",
      mimeType: declaredMimeType,
      detectedType: detectedType || "unknown",
    };
  }

  // Additional 3MF validation happens in the parser (lib/3mf-parser.ts)
  // which checks for required files like [Content_Types].xml and 3D/3dmodel.model

  return {
    valid: true,
    detectedType,
    mimeType: declaredMimeType,
    extension: "3mf",
  };
}

/**
 * Sanitize filename to prevent directory traversal and other attacks.
 * Removes: path separators, null bytes, control characters.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[\/\\]/g, "_") // Replace path separators
    .replace(/\0/g, "") // Remove null bytes
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove control characters
    .replace(/^\.+/, "") // Remove leading dots
    .trim()
    .slice(0, 255); // Limit length
}

/**
 * Validate file extension matches expected type.
 */
export function validateExtension(filename: string, expectedExtensions: string[]): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? expectedExtensions.includes(ext) : false;
}

/**
 * Get safe MIME type for serving files.
 * Prevents MIME confusion attacks.
 */
export function getSafeMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    '3mf': 'model/3mf',
    'zip': 'application/zip',
  };
  
  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}

/**
 * Check if buffer contains potentially malicious content.
 * Basic checks for embedded scripts, executables, etc.
 */
export function containsSuspiciousContent(buffer: Buffer): boolean {
  const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1024));
  
  // Check for script tags (XSS in SVG/HTML disguised as images)
  if (/<script/i.test(content)) return true;
  
  // Check for executable signatures
  if (buffer[0] === 0x4D && buffer[1] === 0x5A) return true; // MZ (Windows EXE)
  if (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) return true; // ELF (Linux)
  
  return false;
}

// Made with Bob
