import { ref } from 'vue'
import mitt from 'mitt'

type PreviewPayload = {
  imgs: string[]
  index: number
}

type Events = {
  'open-image-preview': PreviewPayload
}

const EMOJI_BASE_URL = 'https://img.t.sinajs.cn/t4/appstyle/expression/ext/normal'
const emojiReady = ref(false)
const emojiIndex = new Map<string, string>()
let emojiLoadPromise: Promise<void> | null = null

async function loadEmojiIndex() {
  const response = await fetch('/emoji.json')
  if (!response.ok) {
    throw new Error('Failed to load emoji.json')
  }
  const data = (await response.json()) as Array<{ phrase: string[]; path: string }>
  data.forEach((item) => {
    item.phrase.forEach((phrase) => {
      const path = item.path.startsWith('http') ? item.path : `${EMOJI_BASE_URL}${item.path}`
      emojiIndex.set(phrase, path)
    })
  })
  emojiReady.value = true
}

export function useEmoji() {
  if (!emojiLoadPromise) {
    emojiLoadPromise = loadEmojiIndex().catch(() => {
      emojiReady.value = true
    })
  }

  function getEmojiUrl(phrase: string) {
    if (!emojiReady.value) {
      return ''
    }
    return emojiIndex.get(phrase) || ''
  }

  return { getEmojiUrl }
}

export const emitter = mitt<Events>()
