export type Route =
  | { name: 'dashboard' }
  | { name: 'matrix'; employeeId: string }
  | { name: 'settings' }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '').replace(/\/$/, '') || '/'
  const path = raw.startsWith('/') ? raw : `/${raw}`
  if (path === '/settings') return { name: 'settings' }
  const match = /^\/employee\/([^/]+)$/.exec(path)
  if (match?.[1]) return { name: 'matrix', employeeId: decodeURIComponent(match[1]) }
  return { name: 'dashboard' }
}

export function hrefFor(route: Route) {
  if (route.name === 'settings') return '#/settings'
  if (route.name === 'matrix') return `#/employee/${encodeURIComponent(route.employeeId)}`
  return '#/'
}
