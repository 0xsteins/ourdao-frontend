import { IPFS_GATEWAY } from '@/constants'

// Encryption utilities
export async function encryptData(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  
  // Generate salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  
  // Derive key from password
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
  
  // Encrypt data
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encoder.encode(data)
  )
  
  // Combine salt, iv, and encrypted data
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(encrypted), salt.length + iv.length)
  
  return btoa(String.fromCharCode(...combined))
}

export async function decryptData(encryptedData: string, password: string): Promise<string> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  
  // Decode base64
  const combined = new Uint8Array(
    atob(encryptedData).split('').map(char => char.charCodeAt(0))
  )
  
  // Extract components
  const salt = combined.slice(0, 16)
  const iv = combined.slice(16, 28)
  const encrypted = combined.slice(28)
  
  // Derive key from password
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
  
  // Decrypt data
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encrypted
  )
  
  return decoder.decode(decrypted)
}

// IPFS upload with encryption. Encryption happens here, client-side, before
// anything leaves the browser — the server route this posts to only ever
// sees the resulting ciphertext, never the plaintext file.
export async function uploadToIPFS(
  file: File,
  encrypt: boolean = false,
  password?: string
): Promise<{ hash: string; size: number; encrypted: boolean }> {
  const fileContent = await file.arrayBuffer()
  let processedData: Uint8Array

  if (encrypt && password) {
    const fileText = new TextDecoder().decode(fileContent)
    const encryptedText = await encryptData(fileText, password)
    processedData = new TextEncoder().encode(encryptedText)
  } else {
    processedData = new Uint8Array(fileContent)
  }

  // TS's Uint8Array is generic over its buffer type as of TS 5.7+; BlobPart
  // requires an ArrayBuffer-backed one specifically, so copy into a fresh
  // Uint8Array to satisfy that (no behavior change) — same fix as
  // DocumentViewer.tsx's preview blob.
  const res = await fetch('/api/documents', {
    method: 'POST',
    body: new Blob([new Uint8Array(processedData)]),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || `Document upload failed (${res.status})`)
  }

  const { hash } = (await res.json()) as { hash: string }

  return {
    hash,
    size: processedData.length,
    encrypted: encrypt,
  }
}

// IPFS download with decryption, read straight from the public gateway — no
// credential needed for reads. Validates hash before fetch.
export async function downloadFromIPFS(
  hash: string,
  encrypted: boolean = false,
  password?: string
): Promise<{ content: Uint8Array; decrypted: boolean }> {
  if (!validateIPFSHash(hash)) {
    throw new Error(`Invalid IPFS hash format: ${hash}`)
  }
  const res = await fetch(`${IPFS_GATEWAY}${hash}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch document from IPFS gateway (${res.status})`)
  }
  const fileData = new Uint8Array(await res.arrayBuffer())

  if (encrypted && password) {
    const encryptedText = new TextDecoder().decode(fileData)
    const decryptedText = await decryptData(encryptedText, password)
    return {
      content: new TextEncoder().encode(decryptedText),
      decrypted: true,
    }
  }

  return {
    content: fileData,
    decrypted: false,
  }
}

// Get IPFS URL for direct access. Validates hash before building URL.
export function getIPFSUrl(hash: string): string {
  if (!validateIPFSHash(hash)) {
    throw new Error(`Invalid IPFS hash format: ${hash}`)
  }
  return `${IPFS_GATEWAY}${hash}`
}

// Validate IPFS hash format (CIDv0 and CIDv1).
// Accepts: CIDv0 (Qm..., 46 chars), CIDv1 with multibase b/f/z (variable length).
// Does NOT validate multihash structure — this is a shape check only.
export function validateIPFSHash(hash: string): boolean {
  // CIDv0: base58btc encoded, always 46 characters (Qm + 44 base58 chars)
  const cidV0Regex = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/
  // CIDv1: multibase prefix + base-encoded CID. Support common prefixes:
  // - b: base32 (most common, ~59 chars for sha2-256)
  // - f: base16 (hex, longer)
  // - z: base58btc (legacy v0-like encoding)
  // Length varies with multihash algorithm; accept 7-80 chars after prefix.
  const cidV1Regex = /^[bfz][a-zA-Z0-9]{7,80}$/
  return cidV0Regex.test(hash) || cidV1Regex.test(hash)
}

/* AUDIT COMMENT - ISSUE #151 & #152 ANALYSIS:
 *
 * CURRENT STATUS: ❌ NEEDS FIXES
 *
 * ISSUE #151 - CID validation is too restrictive:
 * - cidV1Regex hard-codes exactly 59 characters via {58} quantifier
 * - Only accepts base32 prefix 'b', rejects other valid multibase prefixes (f, z, uppercase)
 * - Rejects valid CIDv1 with non-sha2-256 multihashes (different lengths)
 * - Example failures: 60-char CIDv1 strings, 'f'/'z'-prefixed CIDv1
 *
 * ISSUE #152 - Validator is never called:
 * - grep shows this function has exactly ONE occurrence (its declaration)
 * - getIPFSUrl (line 167-169) does bare string interpolation: `${IPFS_GATEWAY}${hash}`
 * - downloadFromIPFS (line 145) uses unvalidated hash in fetch URL
 * - No validation before contract calls either
 * - Malformed/malicious hashes flow straight through to URL construction
 *
 * REQUIRED FIXES:
 * 1. Relax cidV1Regex to accept variable-length hashes and multiple multibase prefixes
 *    - Support common prefixes: b (base32), f (base16), z (base58btc)
 *    - Use length range instead of fixed {58}: CIDv1 multibase has ~7-60 chars after prefix
 * 2. Add explicit comment documenting:
 *    - What IS accepted: CIDv0 (46 chars), CIDv1 with b/f/z prefixes (variable length)
 *    - What is NOT accepted: other multibase prefixes, malformed strings
 *    - This is a SHAPE CHECK only, not cryptographic proof
 * 3. Call validateIPFSHash() before URL construction:
 *    - Modify getIPFSUrl() to validate and throw on failure
 *    - Add validation to downloadFromIPFS() before fetch
 *    - Add validation before contract calls that use hashes
 * 4. Update test/ipfs.test.ts to cover:
 *    - CIDv0 pass case (already in test)
 *    - Common CIDv1 forms (bafybei..., bafkrei...)
 *    - 60-char CIDv1 (should pass after fix)
 *    - Non-base32 prefixes (f-, z-prefixed after fix)
 *    - Invalid formats rejection (clear error message)
 *
 * SUGGESTED UPGRADES:
 * - Consider using a proper CID library (multiformats/cid) for multihash validation
 *   + Pros: Full CID spec compliance, catches more errors
 *   + Cons: +~50KB bundle size for one validation function
 * - Alternative: Regex only but relaxed — accept more prefixes and lengths
 *   + Pros: No dependency, explicit set documented
 *   + Cons: Cannot validate multihash structure itself
 * - Add logging on validation failure (not hard errors initially)
 *   + Helps identify production issues without breaking existing documents
 *
 * SECURITY NOTE: This is NOT currently a security boundary. Hash validation
 * matters for UX (broken images) not security (no sanitization of output URL).
 * If later used as security control, proper URL encoding is also needed.
 */

// Generate document metadata
export interface DocumentMetadata {
  name: string
  type: string
  size: number
  uploadedAt: Date
  encrypted: boolean
  hash: string
  tags?: string[]
  permissions?: {
    public: boolean
    allowedUsers?: string[]
    allowedRoles?: string[]
  }
}

export function createDocumentMetadata(
  file: File,
  hash: string,
  encrypted: boolean,
  permissions?: DocumentMetadata['permissions']
): DocumentMetadata {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    uploadedAt: new Date(),
    encrypted,
    hash,
    permissions: permissions || { public: !encrypted }
  }
}

// Document access control
export function canAccessDocument(
  metadata: DocumentMetadata,
  userAddress: string,
  userRoles: string[] = []
): boolean {
  if (metadata.permissions?.public) {
    return true
  }

  // Stellar public keys are uppercase base32 (G… / C…, 56 chars).
  // Do NOT lowercase — the canonical form is all-caps and lowercasing the
  // needle means it can never match an address stored in canonical form.
  // Compare both sides as-is; callers are responsible for passing the address
  // in the same form it was stored (canonical uppercase for Stellar).
  if (metadata.permissions?.allowedUsers?.includes(userAddress)) {
    return true
  }
  
  if (metadata.permissions?.allowedRoles?.some(role => userRoles.includes(role))) {
    return true
  }
  
  return false
}

// Batch upload multiple documents
export async function uploadMultipleDocuments(
  files: File[],
  encrypt: boolean = false,
  password?: string,
  onProgress?: (progress: number) => void
): Promise<DocumentMetadata[]> {
  const results: DocumentMetadata[] = []
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const uploadResult = await uploadToIPFS(file, encrypt, password)
    const metadata = createDocumentMetadata(file, uploadResult.hash, encrypt)
    results.push(metadata)
    
    if (onProgress) {
      onProgress((i + 1) / files.length * 100)
    }
  }
  
  return results
}

// Document search and filtering
export interface DocumentFilter {
  type?: string
  encrypted?: boolean
  tags?: string[]
  dateFrom?: Date
  dateTo?: Date
  sizeMin?: number
  sizeMax?: number
}

export function filterDocuments(
  documents: DocumentMetadata[],
  filter: DocumentFilter
): DocumentMetadata[] {
  return documents.filter(doc => {
    if (filter.type && doc.type !== filter.type) return false
    if (filter.encrypted !== undefined && doc.encrypted !== filter.encrypted) return false
    if (filter.tags && !filter.tags.some(tag => doc.tags?.includes(tag))) return false
    if (filter.dateFrom && doc.uploadedAt < filter.dateFrom) return false
    if (filter.dateTo && doc.uploadedAt > filter.dateTo) return false
    if (filter.sizeMin && doc.size < filter.sizeMin) return false
    if (filter.sizeMax && doc.size > filter.sizeMax) return false
    return true
  })
}
