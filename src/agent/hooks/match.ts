/**
 * matcher 为 JS RegExp 源。
 * - 空字符串 / undefined / `"*"` → 全匹配
 * - 非法正则 → 不匹配（安全侧）
 */
export function matcherMatches(
  matcher: string | undefined,
  haystack: string,
): boolean {
  const source = matcher ?? ''
  if (source === '' || source === '*') return true
  try {
    return new RegExp(source).test(haystack)
  } catch {
    return false
  }
}
