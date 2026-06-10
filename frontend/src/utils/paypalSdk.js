const PAYPAL_SCRIPT_ID = 'socialmind-paypal-sdk'

let sdkPromise = null
let sdkSource = ''

export function loadPayPalSdk({ clientId }) {
  if (!clientId) {
    return Promise.reject(new Error('PayPal client ID is missing.'))
  }

  const params = new URLSearchParams({
    'client-id': clientId,
    components: 'buttons',
    vault: 'true',
    intent: 'subscription',
  })
  const source = `https://www.paypal.com/sdk/js?${params.toString()}`

  if (window.paypal && sdkPromise && sdkSource === source) {
    return sdkPromise
  }

  const existing = document.getElementById(PAYPAL_SCRIPT_ID)
  if (existing && sdkSource !== source) {
    existing.remove()
    sdkPromise = null
    sdkSource = ''
    window.paypal = undefined
  }

  if (window.paypal && sdkSource === source) {
    sdkPromise = Promise.resolve(window.paypal)
    return sdkPromise
  }

  sdkSource = source
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = PAYPAL_SCRIPT_ID
    script.src = source
    script.async = true
    script.onload = () => {
      if (window.paypal) {
        resolve(window.paypal)
      } else {
        reject(new Error('PayPal SDK loaded without window.paypal.'))
      }
    }
    script.onerror = () => reject(new Error('Unable to load the PayPal SDK.'))
    document.body.appendChild(script)
  })

  return sdkPromise
}
