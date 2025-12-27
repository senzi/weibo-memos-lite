const BAIDU_CDN_PREFIX = 'https://image.baidu.com/search/down?url='

export function getCdnUrl(url: string) {
  if (!url) {
    return ''
  }
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  if (url.startsWith(BAIDU_CDN_PREFIX)) {
    return url
  }
  return `${BAIDU_CDN_PREFIX}${encodeURIComponent(url)}`
}

export function normalizeImages(input: unknown): string[] {
  if (!input) {
    return []
  }
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item?.large?.url) {
          return item.large.url
        }
        if (item?.url) {
          return item.url
        }
        return ''
      })
      .filter(Boolean)
  }
  return []
}

export { BAIDU_CDN_PREFIX }
