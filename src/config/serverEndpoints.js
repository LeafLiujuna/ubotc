import { getClientEnv } from './env'

const trimLeadingSlash = (value) => value.replace(/^\/+/, '')
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1'])

function getWindowOrigin(port) {
  if (typeof window === 'undefined') {
    return `http://localhost:${port}`
  }

  return `${window.location.protocol}//${window.location.hostname}:${port}`
}

export function resolveBrowserReachableUrl(value) {
  if (!value || typeof window === 'undefined' || loopbackHosts.has(window.location.hostname)) {
    return value
  }

  try {
    const url = new URL(value)
    if (loopbackHosts.has(url.hostname)) {
      url.hostname = window.location.hostname
    }
    return url.toString().replace(/\/$/, '')
  } catch (_error) {
    return value
  }
}

function getBackendBaseUrl() {
  const env = getClientEnv()
  const baseUrl =
    env.VITE_BACKEND_HTTP_ORIGIN ||
    (env.VITE_API_BASE_URL || '').replace(/\/api\/?$/, '') ||
    getWindowOrigin(8084)

  if (!baseUrl.startsWith('http')) {
    console.warn('Invalid base URL format:', baseUrl)
    return getWindowOrigin(8084)
  }

  return resolveBrowserReachableUrl(baseUrl)
}

export function getBackendHttpOrigin() {
  return getBackendBaseUrl()
}

export function getBackendWsOrigin() {
  const baseUrl = getBackendBaseUrl()
  const wsProtocol = baseUrl.startsWith('https:') ? 'wss:' : 'ws:'
  return baseUrl.replace(/^https?:/, wsProtocol)
}

export function buildBackendHttpUrl(path) {
  const normalizedPath = trimLeadingSlash(path || '')
  return `${getBackendHttpOrigin()}/${normalizedPath}`
}

export function buildBackendWsUrl(path) {
  const normalizedPath = trimLeadingSlash(path || '')
  return `${getBackendWsOrigin()}/${normalizedPath}`
}
