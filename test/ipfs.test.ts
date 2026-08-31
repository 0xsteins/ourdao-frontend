import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { downloadFromIPFS, getIPFSUrl, uploadToIPFS, encryptData, decryptData, validateIPFSHash } from '@/lib/ipfs'

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve('') } as Response
}

function bytesResponse(bytes: Uint8Array, ok = true, status = ok ? 200 : 500) {
  return { ok, status, arrayBuffer: () => Promise.resolve(bytes.buffer) } as unknown as Response
}

describe('encryptData / decryptData', () => {
  it('round-trips plaintext through AES-GCM with a derived key', async () => {
    const plaintext = 'the loan document contents'
    const encrypted = await encryptData(plaintext, 'a strong password')
    expect(encrypted).not.toBe(plaintext)
    expect(await decryptData(encrypted, 'a strong password')).toBe(plaintext)
  })

  it('fails to decrypt with the wrong password', async () => {
    const encrypted = await encryptData('secret', 'correct password')
    await expect(decryptData(encrypted, 'wrong password')).rejects.toThrow()
  })
})

describe('uploadToIPFS', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the (unencrypted) file bytes to /api/documents and returns the pinned hash', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ hash: 'QmTestHash' }))
    const file = new File(['hello world'], 'doc.txt', { type: 'text/plain' })

    const result = await uploadToIPFS(file, false)

    expect(fetch).toHaveBeenCalledWith('/api/documents', expect.objectContaining({ method: 'POST' }))
    expect(result.hash).toBe('QmTestHash')
    expect(result.encrypted).toBe(false)
  })

  it('encrypts before uploading when a password is given', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ hash: 'QmEncryptedHash' }))
    const file = new File(['hello world'], 'doc.txt', { type: 'text/plain' })

    const result = await uploadToIPFS(file, true, 'a password')

    expect(result.encrypted).toBe(true)
    expect(result.hash).toBe('QmEncryptedHash')
    // The uploaded body is ciphertext, not the plaintext file content.
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const uploadedText = await (init!.body as Blob).text()
    expect(uploadedText).not.toContain('hello world')
  })

  it('throws with the server-provided error message on a non-2xx response, not a silent fallback', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: 'Document uploads are not configured on the server (PINATA_JWT is unset).' }, false, 503)
    )
    const file = new File(['hello'], 'doc.txt', { type: 'text/plain' })

    await expect(uploadToIPFS(file)).rejects.toThrow(/PINATA_JWT/)
  })

  it('throws when the upload route is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))
    const file = new File(['hello'], 'doc.txt', { type: 'text/plain' })

    await expect(uploadToIPFS(file)).rejects.toThrow('network error')
  })
})

describe('downloadFromIPFS', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches from the public gateway and returns the raw bytes when not encrypted', async () => {
    const bytes = new TextEncoder().encode('plain content')
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(bytes))

    const result = await downloadFromIPFS('QmSomeHash', false)

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('QmSomeHash'))
    expect(new TextDecoder().decode(result.content)).toBe('plain content')
    expect(result.decrypted).toBe(false)
  })

  it('decrypts the fetched bytes when encrypted and a password is given', async () => {
    const encrypted = await encryptData('secret contents', 'pw')
    const bytes = new TextEncoder().encode(encrypted)
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(bytes))

    const result = await downloadFromIPFS('QmSomeHash', true, 'pw')

    expect(new TextDecoder().decode(result.content)).toBe('secret contents')
    expect(result.decrypted).toBe(true)
  })

  it('throws a visible error when the gateway request fails, not a mock fallback', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(new Uint8Array(), false, 404))
    await expect(downloadFromIPFS('QmMissing')).rejects.toThrow(/404/)
  })
})

describe('getIPFSUrl', () => {
  it('builds a URL against the configured gateway for valid CIDv0', () => {
    expect(getIPFSUrl('QmSomeHash1234567890abcdefghijklmnopqrstuvwxy')).toContain('QmSomeHash')
  })

  it('throws on invalid hash format', () => {
    expect(() => getIPFSUrl('invalid-hash')).toThrow(/Invalid IPFS hash format/)
  })
})

describe('validateIPFSHash', () => {
  it('accepts CIDv0 (46 chars: Qm + 44 base58)', () => {
    expect(validateIPFSHash('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(true)
  })

  it('accepts CIDv1 base32 (bafybei...)', () => {
    expect(validateIPFSHash('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')).toBe(true)
  })

  it('accepts CIDv1 raw base32 (bafkrei...)', () => {
    expect(validateIPFSHash('bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy')).toBe(true)
  })

  it('accepts CIDv1 base16 (f-prefixed)', () => {
    expect(validateIPFSHash('f01550120f8b9b59d2e24a7aded8d05e70b5c81e7cc79b2a3c6d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9')).toBe(true)
  })

  it('accepts CIDv1 base58btc (z-prefixed)', () => {
    expect(validateIPFSHash('zb2rhY7fR7Uk1DJHwGbgXYddPcHHg5AJvj1qJyGJLXYMyHy')).toBe(true)
  })

  it('rejects invalid format (no multibase prefix)', () => {
    expect(validateIPFSHash('invalid-hash-string')).toBe(false)
  })

  it('rejects too short hash (not enough chars after prefix)', () => {
    expect(validateIPFSHash('bshort')).toBe(false)
  })

  it('rejects malformed CIDv0 (wrong length)', () => {
    expect(validateIPFSHash('QmShortHash')).toBe(false)
  })
})

describe('downloadFromIPFS validation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws on invalid hash before making fetch request', async () => {
    await expect(downloadFromIPFS('../../etc/passwd', false)).rejects.toThrow(/Invalid IPFS hash format/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
