export type AuthLink = { kind: 'invite' | 'reset'; token: string }

const TOKEN = /^[0-9a-f]{64}$/

export function readAuthLink(search: string): AuthLink | null {
  const params = new URLSearchParams(search)
  const reset = params.get('reset') ?? ''
  if (TOKEN.test(reset)) return { kind: 'reset', token: reset }
  const invite = params.get('invite') ?? ''
  if (TOKEN.test(invite)) return { kind: 'invite', token: invite }
  return null
}
