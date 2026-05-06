import { describe, it, expect } from "vitest";
import {
  detectFileType,
  validateImageUpload,
  validate3MFUpload,
  sanitizeFilename,
  validateExtension,
  getSafeMimeType,
  containsSuspiciousContent,
} from "@/lib/file-validator";

describe("detectFileType", () => {
  it("detects PNG files", () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    expect(detectFileType(pngHeader)).toBe("image/png");
  });

  it("detects JPEG files", () => {
    const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
    expect(detectFileType(jpegHeader)).toBe("image/jpeg");
  });

  it("detects WEBP files", () => {
    const webpHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size (placeholder)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(detectFileType(webpHeader)).toBe("image/webp");
  });

  it("detects GIF87a files", () => {
    const gifHeader = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
    expect(detectFileType(gifHeader)).toBe("image/gif");
  });

  it("detects GIF89a files", () => {
    const gifHeader = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectFileType(gifHeader)).toBe("image/gif");
  });

  it("detects ZIP files (3MF)", () => {
    const zipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
    expect(detectFileType(zipHeader)).toBe("application/zip");
  });

  it("returns null for unknown file types", () => {
    const unknownHeader = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(detectFileType(unknownHeader)).toBeNull();
  });

  it("returns null for empty buffer", () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });
});

describe("validateImageUpload", () => {
  const maxSize = 10 * 1024 * 1024; // 10 MB

  it("accepts valid PNG file", () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...Array(100).fill(0)]);
    const result = validateImageUpload(pngBuffer, "image/png", maxSize);
    expect(result.valid).toBe(true);
    expect(result.extension).toBe("png");
    expect(result.detectedType).toBe("image/png");
  });

  it("accepts valid JPEG file", () => {
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0)]);
    const result = validateImageUpload(jpegBuffer, "image/jpeg", maxSize);
    expect(result.valid).toBe(true);
    expect(result.extension).toBe("jpg");
  });

  it("accepts image/jpg MIME type (browser variation)", () => {
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0)]);
    const result = validateImageUpload(jpegBuffer, "image/jpg", maxSize);
    expect(result.valid).toBe(true);
    expect(result.extension).toBe("jpg");
  });

  it("accepts valid WEBP file", () => {
    const webpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
      ...Array(100).fill(0),
    ]);
    const result = validateImageUpload(webpBuffer, "image/webp", maxSize);
    expect(result.valid).toBe(true);
    expect(result.extension).toBe("webp");
  });

  it("accepts valid GIF file", () => {
    const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...Array(100).fill(0)]);
    const result = validateImageUpload(gifBuffer, "image/gif", maxSize);
    expect(result.valid).toBe(true);
    expect(result.extension).toBe("gif");
  });

  it("rejects file exceeding size limit", () => {
    const largeBuffer = Buffer.alloc(maxSize + 1);
    largeBuffer[0] = 0x89; // PNG header start
    const result = validateImageUpload(largeBuffer, "image/png", maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too large");
  });

  it("rejects empty file", () => {
    const result = validateImageUpload(Buffer.alloc(0), "image/png", maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Empty file");
  });

  it("rejects unsupported MIME type", () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const result = validateImageUpload(pngBuffer, "application/pdf", maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unsupported MIME type");
  });

  it("rejects file with undetectable type", () => {
    const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    const result = validateImageUpload(invalidBuffer, "image/png", maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Could not detect file type");
  });

  it("rejects MIME type mismatch (declared PNG, actual JPEG)", () => {
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
    const result = validateImageUpload(jpegBuffer, "image/png", maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("MIME type mismatch");
    expect(result.error).toContain("image/png");
    expect(result.error).toContain("image/jpeg");
  });

  it("rejects MIME type mismatch (declared JPEG, actual PNG)", () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const result = validateImageUpload(pngBuffer, "image/jpeg", maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("MIME type mismatch");
  });

  it("prevents executable disguised as image", () => {
    // Windows EXE header (MZ)
    const exeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00]);
    const result = validateImageUpload(exeBuffer, "image/png", maxSize);
    expect(result.valid).toBe(false);
  });
});

describe("validate3MFUpload", () => {
  const maxSize = 150 * 1024 * 1024; // 150 MB

  it("accepts valid 3MF file (ZIP format)", () => {
    const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, ...Array(100).fill(0)]);
    const result = validate3MFUpload(zipBuffer, "model/3mf", maxSize);
    expect(result.valid).toBe(true);
    expect(result.extension).toBe("3mf");
    expect(result.detectedType).toBe("application/zip");
  });

  it("accepts application/vnd.ms-package MIME type", () => {
    const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, ...Array(100).fill(0)]);
    const result = validate3MFUpload(
      zipBuffer,
      "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
      maxSize
    );
    expect(result.valid).toBe(true);
  });

  it("accepts application/zip MIME type", () => {
    const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, ...Array(100).fill(0)]);
    const result = validate3MFUpload(zipBuffer, "application/zip", maxSize);
    expect(result.valid).toBe(true);
  });

  it("accepts application/octet-stream MIME type", () => {
    const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, ...Array(100).fill(0)]);
    const result = validate3MFUpload(zipBuffer, "application/octet-stream", maxSize);
    expect(result.valid).toBe(true);
  });

  it("rejects file exceeding size limit", () => {
    const largeBuffer = Buffer.alloc(maxSize + 1);
    largeBuffer[0] = 0x50; // ZIP header start
    const result = validate3MFUpload(largeBuffer, "model/3mf", maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too large");
  });

  it("rejects empty file", () => {
    const result = validate3MFUpload(Buffer.alloc(0), "model/3mf", maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Empty file");
  });

  it("rejects unsupported MIME type", () => {
    const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
    const result = validate3MFUpload(zipBuffer, "image/png", maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unsupported MIME type for 3MF");
  });

  it("rejects non-ZIP file", () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const result = validate3MFUpload(pngBuffer, "model/3mf", maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not a valid ZIP archive");
  });

  it("prevents executable disguised as 3MF", () => {
    const exeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00]);
    const result = validate3MFUpload(exeBuffer, "model/3mf", maxSize);
    expect(result.valid).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("preserves valid filename", () => {
    expect(sanitizeFilename("photo.jpg")).toBe("photo.jpg");
    expect(sanitizeFilename("model-v2.3mf")).toBe("model-v2.3mf");
  });

  it("removes path separators", () => {
    // Leading dots are also removed by the function
    expect(sanitizeFilename("../../../etc/passwd")).toBe("_.._.._etc_passwd");
    expect(sanitizeFilename("path/to/file.jpg")).toBe("path_to_file.jpg");
    expect(sanitizeFilename("path\\to\\file.jpg")).toBe("path_to_file.jpg");
  });

  it("removes null bytes", () => {
    expect(sanitizeFilename("file\0.jpg")).toBe("file.jpg");
  });

  it("removes control characters", () => {
    expect(sanitizeFilename("file\x00\x01\x1F.jpg")).toBe("file.jpg");
  });

  it("removes leading dots", () => {
    expect(sanitizeFilename("...hidden.txt")).toBe("hidden.txt");
    expect(sanitizeFilename(".htaccess")).toBe("htaccess");
  });

  it("trims whitespace", () => {
    expect(sanitizeFilename("  file.jpg  ")).toBe("file.jpg");
  });

  it("limits length to 255 characters", () => {
    const longName = "a".repeat(300) + ".jpg";
    const result = sanitizeFilename(longName);
    expect(result.length).toBe(255);
  });

  it("handles empty string", () => {
    expect(sanitizeFilename("")).toBe("");
  });

  it("handles only invalid characters", () => {
    expect(sanitizeFilename("///")).toBe("___");
  });
});

describe("validateExtension", () => {
  it("validates correct extension", () => {
    expect(validateExtension("photo.jpg", ["jpg", "png"])).toBe(true);
    expect(validateExtension("model.3mf", ["3mf"])).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(validateExtension("photo.JPG", ["jpg"])).toBe(true);
    expect(validateExtension("photo.Jpg", ["jpg"])).toBe(true);
  });

  it("rejects wrong extension", () => {
    expect(validateExtension("photo.gif", ["jpg", "png"])).toBe(false);
    expect(validateExtension("file.txt", ["3mf"])).toBe(false);
  });

  it("handles no extension", () => {
    expect(validateExtension("noextension", ["jpg"])).toBe(false);
  });

  it("handles multiple dots", () => {
    expect(validateExtension("file.backup.jpg", ["jpg"])).toBe(true);
  });
});

describe("getSafeMimeType", () => {
  it("returns correct MIME types", () => {
    expect(getSafeMimeType("jpg")).toBe("image/jpeg");
    expect(getSafeMimeType("jpeg")).toBe("image/jpeg");
    expect(getSafeMimeType("png")).toBe("image/png");
    expect(getSafeMimeType("webp")).toBe("image/webp");
    expect(getSafeMimeType("gif")).toBe("image/gif");
    expect(getSafeMimeType("3mf")).toBe("model/3mf");
    expect(getSafeMimeType("zip")).toBe("application/zip");
  });

  it("is case-insensitive", () => {
    expect(getSafeMimeType("JPG")).toBe("image/jpeg");
    expect(getSafeMimeType("PNG")).toBe("image/png");
  });

  it("returns octet-stream for unknown extensions", () => {
    expect(getSafeMimeType("unknown")).toBe("application/octet-stream");
    expect(getSafeMimeType("exe")).toBe("application/octet-stream");
  });
});

describe("containsSuspiciousContent", () => {
  it("detects script tags (XSS)", () => {
    const malicious = Buffer.from("<script>alert('xss')</script>");
    expect(containsSuspiciousContent(malicious)).toBe(true);
  });

  it("detects script tags case-insensitive", () => {
    const malicious = Buffer.from("<SCRIPT>alert('xss')</SCRIPT>");
    expect(containsSuspiciousContent(malicious)).toBe(true);
  });

  it("detects Windows executables (MZ header)", () => {
    const exe = Buffer.from([0x4D, 0x5A, 0x90, 0x00]);
    expect(containsSuspiciousContent(exe)).toBe(true);
  });

  it("detects Linux executables (ELF header)", () => {
    const elf = Buffer.from([0x7F, 0x45, 0x4C, 0x46]);
    expect(containsSuspiciousContent(elf)).toBe(true);
  });

  it("accepts clean image data", () => {
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    expect(containsSuspiciousContent(png)).toBe(false);
  });

  it("accepts clean text", () => {
    const text = Buffer.from("This is normal text content");
    expect(containsSuspiciousContent(text)).toBe(false);
  });

  it("only checks first 1024 bytes", () => {
    const large = Buffer.alloc(2000);
    large.write("<script>", 1500); // Script tag beyond 1024 bytes
    expect(containsSuspiciousContent(large)).toBe(false);
  });
});

// Made with Bob
