/** UserPromptSubmit（或其它）hook 以 exit 1 阻断时抛出 */
export class HookBlockedError extends Error {
  readonly event: string
  readonly detail: string

  constructor(event: string, detail: string) {
    super(detail || `Blocked by ${event} hook.`)
    this.name = 'HookBlockedError'
    this.event = event
    this.detail = detail
  }
}
