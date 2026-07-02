import { v2 as cloudinary } from 'cloudinary';

// ─── Cloudinary Config & Diagnostics ──────────────────────────────────────────
const cloudinaryConfig = {
  cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
  api_key: (process.env.CLOUDINARY_API_KEY || '').trim(),
  api_secret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
};

// Diagnostic logging (visible in Render logs)
const maskSecret = (s: string) => s ? `${s.substring(0, 3)}...${s.substring(s.length - 3)} (Len: ${s.length})` : "MISSING";
console.log("--- Cloudinary Diagnostic ---");
console.log("Cloud Name:", cloudinaryConfig.cloud_name || "MISSING");
console.log("API Key:", maskSecret(cloudinaryConfig.api_key));
console.log("API Secret:", maskSecret(cloudinaryConfig.api_secret));

if (cloudinaryConfig.api_secret) {
  if (cloudinaryConfig.api_secret.length === 42) {
    console.warn("⚠️ CAUTION: API Secret length is 42. Most Cloudinary secrets are 27. You may have pasted the API Key or URL into this field!");
  }
  if (/[A-Z]/.test(cloudinaryConfig.api_secret)) {
    console.log("NOTE: API Secret contains uppercase letters. Ensure this matches your Cloudinary Dashboard exactly (it usually does not).");
  }
  if (cloudinaryConfig.api_secret.includes(' ') || cloudinaryConfig.api_secret.includes('\n')) {
    console.warn("⚠️ WARNING: Cloudinary API Secret contains whitespace/newlines! Trimming applied.");
  }
}
console.log("-----------------------------");

cloudinary.config(cloudinaryConfig);

export { cloudinary };
