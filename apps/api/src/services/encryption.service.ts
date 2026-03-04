import CryptoJS from "crypto-js";
import { config } from "../config";

/**
 * AES-256 encryption for sensitive platform tokens stored in the database.
 * Uses the ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 */
export class EncryptionService {
  private readonly key: string;

  constructor() {
    this.key = config.ENCRYPTION_KEY;
  }

  encrypt(plaintext: string): string {
    const encrypted = CryptoJS.AES.encrypt(plaintext, this.key).toString();
    return encrypted;
  }

  decrypt(ciphertext: string): string {
    const bytes = CryptoJS.AES.decrypt(ciphertext, this.key);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
}

export const encryptionService = new EncryptionService();
