import { deriveKeyFromPassword } from './crypto'
import { wordlist } from './bip39-wordlist'

export async function generateRecoveryKey(): Promise<string> {
  const entropy = new Uint8Array(32)
  crypto.getRandomValues(entropy)
  return entropyToMnemonicAsync(entropy)
}

export async function validateRecoveryKey(mnemonic: string): Promise<boolean> {
  const words = mnemonic.trim().split(/\s+/)
  if (words.length !== 24) return false
  for (const word of words) {
    if (!wordlist.includes(word)) return false
  }
  try {
    return await verifyChecksum(words)
  } catch {
    return false
  }
}

export async function deriveMasterKeyFromMnemonic(mnemonic: string, salt: Uint8Array): Promise<CryptoKey> {
  const cleanMnemonic = mnemonic.trim().toLowerCase().split(/\s+/).join(' ')
  const isValid = await validateRecoveryKey(cleanMnemonic)
  if (!isValid) throw new Error('Invalid recovery phrase (checksum failed)')
  return deriveKeyFromPassword(cleanMnemonic, salt)
}

function byteToBinary(byte: number): string {
  return byte.toString(2).padStart(8, '0')
}

async function entropyToMnemonicAsync(entropy: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', entropy)
  const hashBytes = new Uint8Array(hashBuffer)
  const checksumLength = (entropy.length * 8) / 32

  let bits = ''
  for (let i = 0; i < entropy.length; i++) bits += byteToBinary(entropy[i])
  bits += byteToBinary(hashBytes[0]).slice(0, checksumLength)

  const chunks = bits.match(/(.{1,11})/g) || []
  return chunks.map(b => wordlist[parseInt(b, 2)]).join(' ')
}

async function verifyChecksum(words: string[]): Promise<boolean> {
  let bits = ''
  for (const word of words) {
    const index = wordlist.indexOf(word)
    if (index === -1) return false
    bits += index.toString(2).padStart(11, '0')
  }

  const entropyBits = bits.slice(0, 256)
  const checksumBits = bits.slice(256)

  const entropyBytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    entropyBytes[i] = parseInt(entropyBits.slice(i * 8, (i + 1) * 8), 2)
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', entropyBytes)
  const hashBits = new Uint8Array(hashBuffer)[0].toString(2).padStart(8, '0')
  return checksumBits === hashBits
}
