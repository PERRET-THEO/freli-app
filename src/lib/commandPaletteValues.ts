/** Préfixes stables pour les `value` cmdk (unicité + shouldFilter=false). */
export function commandItemValue(
  kind: 'action' | 'nav' | 'recent' | 'project' | 'client',
  id: string,
): string {
  return `${kind}:${id}`
}
