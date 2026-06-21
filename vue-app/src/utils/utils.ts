import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import CryptoJS from 'crypto-js'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const encryptPayload = (payload: unknown, secretKey: string): string =>
  CryptoJS.AES.encrypt(JSON.stringify(payload), secretKey).toString()

export const decryptPayload = (ciphertext: string, secretKey: string): unknown => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, secretKey)
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8))
}

export const getBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
  })
