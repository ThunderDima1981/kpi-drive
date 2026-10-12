export function smtpSecurity(port: number, secureFlag: boolean) {
  if (port === 465) return { secure: true, requireTLS: false }
  if (port === 587) return { secure: false, requireTLS: true }
  return { secure: secureFlag, requireTLS: !secureFlag }
}

export function mailPassword(password: string) {
  return password.replace(/\s/g, '')
}

export function mailErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/535|534|Invalid login|Username and Password not accepted|BadCredentials/i.test(message)) {
    return 'Сервер не принял логин или пароль. Для Gmail нужен пароль приложения из настроек аккаунта Google.'
  }
  if (/ECONNREFUSED|ENETUNREACH/i.test(message)) {
    return 'Почтовый сервер не принял соединение с этого адреса.'
  }
  if (/Greeting never received|wrong version number|ETIMEDOUT/i.test(message)) {
    return 'Не удалось начать защищённое соединение. Для Gmail укажите порт 465 или 587.'
  }
  return 'Не удалось отправить письмо. Проверьте сервер, порт и пароль.'
}
