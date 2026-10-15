import { meetingSummary } from './format'
import type { Group } from './db'
import type { Brand } from '../studio/templates'

export const brandFromGroup = (g: Group): Brand => ({
  groupName: g.name, primary: g.primary_color, secondary: g.secondary_color, hasLogo: !!g.logo_path,
  meeting: meetingSummary(g.meeting_weekday, g.meeting_time), address: g.address || null,
})
