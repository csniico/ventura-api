/** Image content types allowed for presigned uploads. */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * The only folders a client may upload into. A free-form prefix let a caller
 * write anywhere in the bucket, so the set is closed server-side (SEC-001).
 */
export enum UploadFolder {
  LOGOS = 'logos',
  AVATARS = 'avatars',
  RESOURCES = 'resources',
  UPLOADS = 'uploads',
}

export const DEFAULT_UPLOAD_FOLDER = UploadFolder.UPLOADS
