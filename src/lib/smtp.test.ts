import { describe, expect, it } from 'vitest'
import { mailErrorText, mailPassword, smtpSecurity } from './smtp.ts'

describe('smtp security', () => {
  it('uses implicit TLS on 465 and STARTTLS on 587', () => {
    expect(smtpSecurity(465, false)).toEqual({ secure: true, requireTLS: false })
    expect(smtpSecurity(587, true)).toEqual({ secure: false, requireTLS: true })
  })

  it('drops spaces from an app password and names an auth failure', () => {
    expect(mailPassword('abcd efgh ijkl mnop')).toBe('abcdefghijklmnop')
    expect(mailErrorText(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'))).toMatch(/пароль приложения/)
  })
})
