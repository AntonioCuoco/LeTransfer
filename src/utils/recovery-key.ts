import { deriveKeyFromPassword } from './crypto';
import { wordlist } from './bip39-wordlist';

/**
 * Generate a random 24-word recovery phrase (256 bits of entropy)
 * Implements BIP39 standard using Web Crypto API
 */
export async function generateRecoveryKey(): Promise<string> {
    // 1. Generate 256 bits (32 bytes) of entropy
    const entropy = new Uint8Array(32);
    crypto.getRandomValues(entropy);

    // 2. Calculate checksum (SHA-256) and convert to words
    return entropyToMnemonicAsync(entropy);
}

/**
 * Validate a recovery phrase (checksum check)
 */
export async function validateRecoveryKey(mnemonic: string): Promise<boolean> {
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 24) return false;

    // Check if checks words exist in wordlist
    for (const word of words) {
        if (!wordlist.includes(word)) return false;
    }

    try {
        // Convert mnemonic back to entropy to verify checksum
        return await verifyChecksum(words);
    } catch (e) {
        return false;
    }
}

/**
 * Derive the Master Key from recovery phrase + salt
 * We treat the 24-word mnemonic string as the "password" for PBKDF2
 */
export async function deriveMasterKeyFromMnemonic(
    mnemonic: string,
    salt: Uint8Array
): Promise<CryptoKey> {
    // Normalize: trim, lowercase, and collapse any whitespace (newlines, tabs, multiple spaces) into single spaces
    const cleanMnemonic = mnemonic
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .join(' ');

    // Validate mnemonic before derivation
    const isValid = await validateRecoveryKey(cleanMnemonic);
    if (!isValid) {
        throw new Error('Invalid recovery phrase (checksum failed)');
    }

    // Use the mnemonic as the password input for PBKDF2
    return await deriveKeyFromPassword(cleanMnemonic, salt);
}


// ================= HELPER FUNCTIONS =================

function byteToBinary(byte: number): string {
    return byte.toString(2).padStart(8, '0');
}

async function entropyToMnemonicAsync(entropy: Uint8Array): Promise<string> {
    // Checksum
    const hashBuffer = await crypto.subtle.digest('SHA-256', entropy as BufferSource);
    const hashBytes = new Uint8Array(hashBuffer);

    // First (entropy.length / 32) bits
    const checksumLength = entropy.length * 8 / 32; // 256 -> 8
    const hashBits = byteToBinary(hashBytes[0]); // First 8 bits enough for 256-bit entropy

    let bits = '';
    for (let i = 0; i < entropy.length; i++) {
        bits += byteToBinary(entropy[i]);
    }
    bits += hashBits.slice(0, checksumLength); // append checksum

    const chunks = bits.match(/(.{1,11})/g) || [];
    const words = chunks.map(binary => {
        const index = parseInt(binary, 2);
        return wordlist[index];
    });

    return words.join(' ');
}

async function verifyChecksum(words: string[]): Promise<boolean> {
    // Convert words to binary indices
    let bits = '';
    for (const word of words) {
        const index = wordlist.indexOf(word);
        if (index === -1) return false;
        bits += index.toString(2).padStart(11, '0');
    }

    // Split into entropy and checksum
    // For 24 words: 24 * 11 bits = 264 bits.
    // Entropy = 256 bits, Checksum = 8 bits.
    const entropyBits = bits.slice(0, 256);
    const checksumBits = bits.slice(256);

    // Convert entropy bits back to bytes
    const entropyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        const byteBits = entropyBits.slice(i * 8, (i + 1) * 8);
        entropyBytes[i] = parseInt(byteBits, 2);
    }

    // Calculate hash of entropy
    const hashBuffer = await crypto.subtle.digest('SHA-256', entropyBytes as BufferSource);
    const hashBytes = new Uint8Array(hashBuffer);

    // Get first 8 bits of hash (first byte)
    const hashBits = hashBytes[0].toString(2).padStart(8, '0');

    return checksumBits === hashBits;
}
