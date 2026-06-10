const SHARE_LEDGER_KEY_PREFIX = 'sm_share_ledger:'

function ledgerKey(accountId = 'guest') {
  return `${SHARE_LEDGER_KEY_PREFIX}${String(accountId || 'guest')}`
}

function readLedger(accountId = 'guest') {
  try {
    const parsed = JSON.parse(localStorage.getItem(ledgerKey(accountId)) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLedger(accountId = 'guest', ledger) {
  localStorage.setItem(ledgerKey(accountId), JSON.stringify(ledger && typeof ledger === 'object' ? ledger : {}))
}

export function getLedgerShareCount(accountId, postId) {
  if (!postId) return 0
  const ledger = readLedger(accountId)
  return Number(ledger[String(postId)] || 0)
}

export function incrementLedgerShareCount(accountId, postId) {
  if (!postId) return 0
  const ledger = readLedger(accountId)
  const next = Number(ledger[String(postId)] || 0) + 1
  ledger[String(postId)] = next
  writeLedger(accountId, ledger)
  window.dispatchEvent(new Event('socialmind:share-ledger-changed'))
  return next
}

