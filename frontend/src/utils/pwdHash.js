const storageKey = (email) => `sm_pwd_hash_${email}`

async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function smSavePwd(email, password) {
  const hash = await hashPassword(password)
  localStorage.setItem(storageKey(email), hash)
}

export async function smVerifyPwd(email, password) {
  const stored = localStorage.getItem(storageKey(email))
  if (!stored) return false
  const hash = await hashPassword(password)
  return hash === stored
}
