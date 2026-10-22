export function getClientEnv() {
  return import.meta.env
}

export function isDev() {
  return Boolean(import.meta.env.DEV)
}

export function isLocalLoginEnabled() {
  return isDev() && getClientEnv().VITE_AUTH_MODE === 'local'
}

export function getLoginProvider() {
  return getClientEnv().VITE_AUTH_MODE === 'oidc' ? 'oidc' : 'qq'
}

export function getLoginLabel() {
  return isLocalLoginEnabled() ? '本地登录' : '登录'
}

export function isMockEnabled() {
  return getClientEnv().VITE_USE_MOCK === 'true'
}
