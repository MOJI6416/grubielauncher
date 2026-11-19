import type { ShareGuestRefusal } from '@/types/Share'

export type GuestRefusal = ShareGuestRefusal

const REFUSAL_TEXT: Record<GuestRefusal, { ru: string; en: string }> = {
  removed: {
    ru: 'Хозяин убрал вас из этой игры.',
    en: 'The host removed you from this game.',
  },
  not_invited: {
    ru: 'Сюда заходят только по приглашению хозяина.',
    en: 'This game is open to invited players only.',
  },
  full: {
    ru: 'Все места заняты. Попробуйте зайти позже.',
    en: 'All seats are taken. Try again later.',
  },
}

function encodeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let unsigned = value >>> 0
  do {
    let current = unsigned & 0x7f
    unsigned >>>= 7
    if (unsigned !== 0) current |= 0x80
    bytes.push(current)
  } while (unsigned !== 0)
  return Buffer.from(bytes)
}

export function refusalComponent(reason: GuestRefusal): string {
  const text = REFUSAL_TEXT[reason]
  return JSON.stringify({
    text: text.ru,
    extra: [{ text: `\n${text.en}`, color: 'gray' }],
  })
}

export function encodeLoginDisconnect(reason: GuestRefusal): Buffer {
  const payload = Buffer.from(refusalComponent(reason), 'utf8')
  const body = Buffer.concat([
    Buffer.from([0x00]),
    encodeVarInt(payload.length),
    payload,
  ])
  return Buffer.concat([encodeVarInt(body.length), body])
}
