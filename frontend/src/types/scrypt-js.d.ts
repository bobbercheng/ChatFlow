declare module 'scrypt-js' {
  export function scrypt(
    password: Uint8Array,
    salt: Uint8Array,
    N: number,
    r: number,
    p: number,
    dkLen: number
  ): Promise<Uint8Array>;
} 