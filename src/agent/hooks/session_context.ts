/** SessionStart inject 累积的进程内上下文（并入 system prompt） */

let sessionExtras: string[] = []

export function clearSessionHookExtras(): void {
  sessionExtras = []
}

export function appendSessionHookExtras(text: string): void {
  const t = text.trim()
  if (!t) return
  sessionExtras.push(t)
}

export function getSessionHookExtras(): string {
  if (sessionExtras.length === 0) return ''
  return sessionExtras.join('\n\n')
}

/** 测试用 */
export function getSessionHookExtrasList(): readonly string[] {
  return sessionExtras
}
