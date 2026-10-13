export const SETTINGS_SECTIONS = [
  {
    id: 'team',
    label: 'Сотрудники',
    title: 'Сотрудники',
    description: 'Добавляйте сотрудников и назначайте руководителя. Новый месяц копирует этот состав.',
  },
  {
    id: 'kpi',
    label: 'Показатели',
    title: 'Количественные показатели',
    description: 'Справочник KPI открытого месяца: план, факт, шкала и загрузка из Excel.',
  },
  {
    id: 'users',
    label: 'Пользователи',
    title: 'Права пользователей',
    description: 'Учётные записи, пароли и матрицы, которые видит пользователь.',
  },
  {
    id: 'mail',
    label: 'Почта',
    title: 'Почтовый сервер',
    description: 'Параметры SMTP для писем о smart-задачах.',
  },
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']

export type Route =
  | { name: 'dashboard' }
  | { name: 'matrix'; employeeId: string }
  | { name: 'evaluations' }
  | { name: 'settings'; section: SettingsSection }

export function settingsSection(id: string | undefined): SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.id === id) ? (id as SettingsSection) : 'team'
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '').split('?')[0]?.replace(/\/$/, '') || '/'
  const path = raw.startsWith('/') ? raw : `/${raw}`
  if (path === '/evaluations') return { name: 'evaluations' }
  if (path === '/settings') return { name: 'settings', section: 'team' }
  const settings = /^\/settings\/([^/]+)$/.exec(path)
  if (settings) return { name: 'settings', section: settingsSection(settings[1]) }
  const match = /^\/employee\/([^/]+)$/.exec(path)
  if (match?.[1]) return { name: 'matrix', employeeId: decodeURIComponent(match[1]) }
  return { name: 'dashboard' }
}

export function hrefFor(route: Route) {
  if (route.name === 'evaluations') return '#/evaluations'
  if (route.name === 'settings') return `#/settings/${route.section}`
  if (route.name === 'matrix') return `#/employee/${encodeURIComponent(route.employeeId)}`
  return '#/'
}
