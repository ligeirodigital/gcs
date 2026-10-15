import { describe, expect, it } from 'vitest'
import { AI_MODES, formatForPost, titleFrom } from '../ai'

describe('assistente (cliente)', () => {
  it('oferece os 9 modos', () => { expect(AI_MODES.map(m => m.key)).toEqual(['caption', 'invite', 'campaign_ideas', 'reels_script', 'stories_sequence', 'carousel', 'devotional', 'editorial_calendar', 'bio_cta']) })
  it('mapeia formato do texto para formato de publicação', () => {
    expect([formatForPost('feed'), formatForPost('stories'), formatForPost('reels'), formatForPost('carrossel'), formatForPost('texto')]).toEqual(['feed_vertical', 'story', 'story', 'carousel', 'feed_square'])
  })
  it('gera título a partir da primeira linha útil', () => {
    expect(titleFrom('\n\n## Venha conhecer o GC!\nTexto', 'Legenda')).toBe('Venha conhecer o GC!')
    expect(titleFrom('', 'Legenda')).toBe('Legenda'); expect(titleFrom('x'.repeat(200), 'F')).toHaveLength(80)
  })
})
