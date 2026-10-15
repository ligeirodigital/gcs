/** Quebra de linhas (usada pelo renderizador do canvas; independente de DOM para ser testável). */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    if (para.trim() === '') { lines.push(''); continue }
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (measure(candidate) <= maxWidth) { line = candidate; continue }
      if (line) { lines.push(line); line = '' }
      if (measure(word) <= maxWidth) { line = word; continue }
      // palavra maior que a caixa: quebra por caractere
      let chunk = ''
      for (const ch of word) {
        if (measure(chunk + ch) > maxWidth && chunk) { lines.push(chunk); chunk = ch } else chunk += ch
      }
      line = chunk
    }
    lines.push(line)
  }
  return lines
}
