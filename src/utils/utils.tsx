import type { ClassValue } from "clsx";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import CryptoJS from 'crypto-js';

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};

export const encryptPayload = (payload: any, secretKey: string) => {
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), secretKey).toString();
  return ciphertext;
};

export const decryptPayload = (ciphertext: string, secretKey: string) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, secretKey);
  const originalPayload = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  return originalPayload;
};

export const getBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });