// Vector icon set for flow nodes (react-icons / Lucide).
//
// Why this exists: nodes used to render a bare emoji in the header (⚡🔀🎯…).
// Emojis render inconsistently across platforms and look amateur — and the DST
// in-game CEF browser draws many of them as "?". Lucide SVGs are crisp in any
// Chromium and give the editor an n8n/Zapier-grade, professional look.
//
// The BaseNode still receives the legacy `icon` emoji string from each of the 50
// node ui.tsx files (we did NOT change that contract). We map it to a vector icon
// by node `type` first, then by a keyword guess on the emoji, and fall back to a
// generic dot — so every node gets a clean glyph with zero per-node edits.
import type { IconType } from 'react-icons'
import {
  LuZap, LuGitBranch, LuListFilter, LuSplit, LuRepeat, LuClock,
  LuTarget, LuBot, LuBrain, LuDatabase, LuGlobe, LuCode, LuFileText,
  LuUser, LuUserSearch, LuShuffle, LuType, LuVariable, LuShieldCheck,
  LuLayoutDashboard, LuHeart, LuSkull, LuTrash2, LuMapPin, LuGift,
  LuSend, LuWebhook, LuMerge, LuCalendar, LuSquareStack, LuHash,
  LuMousePointerClick, LuPanelTop, LuRows3, LuColumns3, LuImage,
  LuTextCursorInput, LuMinus, LuCircleDot,
} from 'react-icons/lu'

// One icon per canonical node `type` passed to BaseNode/UIBox.
const BY_TYPE: Record<string, IconType> = {
  trigger: LuZap,
  condition: LuGitBranch,
  action: LuTarget,
  delay: LuClock,
  wait: LuMerge,
  ai_agent: LuBot,
}

// Keyword → icon. The key is matched against the legacy emoji AND against the
// node label/action_type when available (BaseNode passes the label too), so a
// "Get Player" action gets the player glyph instead of the generic target.
const BY_KEYWORD: Array<[RegExp, IconType]> = [
  [/webhook/i, LuWebhook],
  [/condi|branch|🔀/i, LuGitBranch],
  [/filtr|filter/i, LuListFilter],
  [/switch|case/i, LuSplit],
  [/loop|foreach|repeat|🔁|🔄/i, LuRepeat],
  [/delay|wait|aguard|⏲|⏳/i, LuClock],
  [/merge|wait/i, LuMerge],
  [/find.?player|🔍/i, LuUserSearch],
  [/player|👤/i, LuUser],
  [/heal|cura|❤|♥/i, LuHeart],
  [/kill|death|skull|💀/i, LuSkull],
  [/remov|delete|🗑/i, LuTrash2],
  [/teleport|tp|map|🌀|📍/i, LuMapPin],
  [/give|item|gift|🎁|📦/i, LuGift],
  [/chat|send|message|💬|📤/i, LuSend],
  [/http|request|fetch|🌐/i, LuGlobe],
  [/script|code|js|⚙/i, LuCode],
  [/log|📋|📝/i, LuFileText],
  [/random|shuffle|🎲/i, LuShuffle],
  [/transform|upper|lower|type/i, LuType],
  [/variable|set.?var|var/i, LuVariable],
  [/split|✂/i, LuSplit],
  [/memory|store|db|🗃|💾/i, LuDatabase],
  [/agent|🤖/i, LuBot],
  [/ai.?memory|brain|🧠/i, LuBrain],
  [/claim|protect|shield|🛡/i, LuShieldCheck],
  [/list.?flows|stack/i, LuSquareStack],
  [/count|number|🔢|#/i, LuHash],
  [/date|time|calendar/i, LuCalendar],
  [/callback|click|🖱/i, LuMousePointerClick],
  // UI primitives
  [/painel|panel|🪟/i, LuPanelTop],
  [/row|linha/i, LuRows3],
  [/col|coluna/i, LuColumns3],
  [/icon|image|imagem|🖼/i, LuImage],
  [/text.?input|input|campo/i, LuTextCursorInput],
  [/text|texto|🔤/i, LuType],
  [/spacer|espaç/i, LuMinus],
  [/builder|dashboard|🎨/i, LuLayoutDashboard],
  [/menu/i, LuPanelTop],
]

// Resolve a vector icon for a node. `type` is the canonical BaseNode type;
// `hint` is the legacy emoji + label string used for keyword matching.
export function nodeIcon(type: string | undefined, hint?: string): IconType {
  if (hint) {
    for (const [re, Icon] of BY_KEYWORD) if (re.test(hint)) return Icon
  }
  if (type && BY_TYPE[type]) return BY_TYPE[type]
  return LuCircleDot
}
