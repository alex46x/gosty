/**
 * CRYPTOGRAPHY SERVICE
 * 
 * Handles all client-side encryption/decryption using the native Web Crypto API.
 * 
 * SCHEME: Hybrid Encryption
 * 1. RSA-OAEP (2048-bit) for Key Exchange.
 * 2. AES-GCM (256-bit) for Message Content.
 */

// --- UTILITIES ---

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

// --- SUPPORT CHECK ---

export const checkCryptoSupport = (): boolean => {
  if (!window.crypto || !window.crypto.subtle) {
    return false;
  }
  return true;
};

// --- KEY GENERATION ---

export const generateKeyPair = async (): Promise<{ publicKey: string; privateKey: CryptoKey }> => {
  if (!checkCryptoSupport()) {
    console.warn("Using INSECURE dummy keys for testing");
    return {
      publicKey: "INSECURE_PUB_" + Math.random().toString(36).substring(7),
      privateKey: { type: "private", extractable: true, algorithm: { name: "INSECURE" }, usages: ["decrypt"] } as unknown as CryptoKey
    };
  }

  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  // Export Public Key to Base64 for server storage
  const exportedPublic = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicKeyString = arrayBufferToBase64(exportedPublic);

  return {
    publicKey: publicKeyString,
    privateKey: keyPair.privateKey
  };
};

export const importPublicKey = async (pem: string): Promise<CryptoKey> => {
  const binaryDer = base64ToArrayBuffer(pem);
  return await window.crypto.subtle.importKey(
    "spki",
    binaryDer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
};

// --- ENCRYPTION (SENDING) ---

interface EncryptedPayload {
  encryptedContent: string;
  iv: string;
  encryptedKeyForReceiver: string;
  encryptedKeyForSender: string;
}

export const encryptMessage = async (
  text: string, 
  receiverPublicKeyPem: string, 
  senderPublicKeyPem: string
): Promise<EncryptedPayload> => {
  // Check for insecure context OR insecure keys
  if (!checkCryptoSupport() || receiverPublicKeyPem.startsWith("INSECURE_") || senderPublicKeyPem.startsWith("INSECURE_")) {
    // Mock Encryption: Just Base64 encode
    return {
      encryptedContent: "[[INSECURE::" + window.btoa(text) + "]]",
      iv: "INSECURE_IV",
      encryptedKeyForReceiver: "INSECURE_KEY",
      encryptedKeyForSender: "INSECURE_KEY"
    };
  }

  const textEncoder = new TextEncoder();
  const encodedText = textEncoder.encode(text);

  // 1. Generate one-time AES Session Key
  const sessionKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // 2. Encrypt Content with AES Session Key
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedContentBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    sessionKey,
    encodedText
  );

  // 3. Export Session Key (Raw) to wrap it
  const rawSessionKey = await window.crypto.subtle.exportKey("raw", sessionKey);

  // 4. Encrypt Session Key with Receiver's Public Key (RSA)
  const receiverKey = await importPublicKey(receiverPublicKeyPem);
  const encryptedKeyReceiverBuffer = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    receiverKey,
    rawSessionKey
  );

  // 5. Encrypt Session Key with Sender's Public Key (RSA) - for self-history
  const senderKey = await importPublicKey(senderPublicKeyPem);
  const encryptedKeySenderBuffer = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    senderKey,
    rawSessionKey
  );

  return {
    encryptedContent: arrayBufferToBase64(encryptedContentBuffer),
    iv: arrayBufferToBase64(iv),
    encryptedKeyForReceiver: arrayBufferToBase64(encryptedKeyReceiverBuffer),
    encryptedKeyForSender: arrayBufferToBase64(encryptedKeySenderBuffer)
  };
};

// --- DECRYPTION (RECEIVING) ---

export const decryptMessage = async (
  encryptedContentB64: string,
  ivB64: string,
  encryptedKeyB64: string,
  privateKey: CryptoKey
): Promise<string> => {
  // Check for mock encryption marker
  if (encryptedContentB64.startsWith("[[INSECURE::")) {
      const b64 = encryptedContentB64.replace("[[INSECURE::", "").replace("]]", "");
      try {
          return window.atob(b64);
      } catch (e) {
          return "[[INVALID MOCK ENCRYPTION]]";
      }
  }

  if (!checkCryptoSupport()) {
    return "[[DECRYPTION FAILED: INSECURE CONTEXT]]";
  }

  try {
    // 1. Decrypt the AES Session Key using RSA Private Key
    const encryptedKeyBuffer = base64ToArrayBuffer(encryptedKeyB64);
    const rawSessionKeyBuffer = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedKeyBuffer
    );

    // 2. Import the revealed AES Session Key
    const sessionKey = await window.crypto.subtle.importKey(
      "raw",
      rawSessionKeyBuffer,
      { name: "AES-GCM" },
      true,
      ["decrypt"]
    );

    // 3. Decrypt the content using AES Session Key
    const iv = base64ToArrayBuffer(ivB64);
    const encryptedContent = base64ToArrayBuffer(encryptedContentB64);
    
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      sessionKey,
      encryptedContent
    );

    const textDecoder = new TextDecoder();
    return textDecoder.decode(decryptedBuffer);
  } catch (e) {
    console.error("Decryption failed", e);
    return "[[DECRYPTION FAILED: INVALID KEY]]";
  }
};

// --- KEY STORAGE HELPERS ---
// In a real app, private keys should be stored in IndexedDB, 
// potentially wrapped with a key derived from the user's password.
// For this MVP, we use LocalStorage.

export const savePrivateKey = async (username: string, key: CryptoKey) => {
  if (!checkCryptoSupport() || (key as any).algorithm?.name === "INSECURE") {
     localStorage.setItem(`ghost_priv_${username}`, "INSECURE_PRIV_KEY");
     return;
  }

  const exported = await window.crypto.subtle.exportKey("pkcs8", key);
  const b64 = arrayBufferToBase64(exported);
  localStorage.setItem(`ghost_priv_${username}`, b64);
};

export const loadPrivateKey = async (username: string): Promise<CryptoKey | null> => {
  const b64 = localStorage.getItem(`ghost_priv_${username}`);
  if (!b64) return null;

  if (b64 === "INSECURE_PRIV_KEY") {
     return { type: "private", extractable: true, algorithm: { name: "INSECURE" }, usages: ["decrypt"] } as unknown as CryptoKey;
  }

  try {
    const binary = base64ToArrayBuffer(b64);
    return await window.crypto.subtle.importKey(
      "pkcs8",
      binary,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["decrypt"]
    );
  } catch (e) {
    console.error("Failed to load private key", e);
    return null;
  }
};