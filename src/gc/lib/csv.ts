/** CSV com escape correto e proteção contra injeção de fórmulas em planilhas (=, +, -, @, tab, CR). */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = v instanceof Date ? v.toISOString() : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function toCsv<T>(rows: T[], columns: { header: string; value: (r: T) => unknown }[]): string {
  const head = columns.map(c => csvCell(c.header)).join(',')
  const body = rows.map(r => columns.map(c => csvCell(c.value(r))).join(','))
  return '﻿' + [head, ...body].join('\r\n')    // BOM para o Excel reconhecer UTF-8
}
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
