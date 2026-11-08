import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Private object storage. Files are NEVER served from /public and never exposed through a public URL:
 * every read goes through an authenticated route handler that checks project permissions first.
 *   STORAGE_DRIVER=local -> files on disk under STORAGE_LOCAL_DIR (default ./storage)
 *   STORAGE_DRIVER=s3    -> any S3-compatible bucket (AWS S3, Supabase Storage S3 endpoint, MinIO)
 */
export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_.\-]*$/;
function assertKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..") || key.includes("//")) throw new Error("Invalid storage key");
}

class LocalStorage implements StorageAdapter {
  // The storage directory is configured at runtime (STORAGE_LOCAL_DIR); it must not be traced into the build output.
  private root = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_LOCAL_DIR || "./storage");
  private full(key: string) {
    assertKey(key);
    const p = path.resolve(/*turbopackIgnore: true*/ this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.full(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  }
  async get(key: string) {
    return fs.readFile(this.full(key));
  }
  async delete(key: string) {
    await fs.rm(this.full(key), { force: true });
  }
  async exists(key: string) {
    try {
      await fs.access(this.full(key));
      return true;
    } catch {
      return false;
    }
  }
}

class S3Storage implements StorageAdapter {
  private bucket = process.env.S3_BUCKET as string;
  private clientP: Promise<import("@aws-sdk/client-s3").S3Client> | undefined;
  private async client() {
    this.clientP ??= import("@aws-sdk/client-s3").then(
      (m) =>
        new m.S3Client({
          region: process.env.S3_REGION || "us-east-1",
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
          credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID as string, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string },
        }),
    );
    return this.clientP;
  }
  async put(key: string, data: Buffer, contentType: string) {
    assertKey(key);
    const m = await import("@aws-sdk/client-s3");
    await (await this.client()).send(new m.PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
  }
  async get(key: string) {
    assertKey(key);
    const m = await import("@aws-sdk/client-s3");
    const r = await (await this.client()).send(new m.GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await (r.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray());
  }
  async delete(key: string) {
    assertKey(key);
    const m = await import("@aws-sdk/client-s3");
    await (await this.client()).send(new m.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async exists(key: string) {
    assertKey(key);
    const m = await import("@aws-sdk/client-s3");
    try {
      await (await this.client()).send(new m.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

declare global {
  var __rvccStorage: StorageAdapter | undefined;
}
export function getStorage(): StorageAdapter {
  if (!globalThis.__rvccStorage) {
    globalThis.__rvccStorage = process.env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
  }
  return globalThis.__rvccStorage;
}
