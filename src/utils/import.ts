import { db, type PostRecord, type UserRecord } from '@/db'
import { normalizeImages } from '@/utils/image'

type ArchivePayload = {
  user?: Record<string, any>
  weibo?: Array<Record<string, any>>
}

function normalizeUser(user: Record<string, any> | undefined): UserRecord | null {
  if (!user) {
    return null
  }
  const uid = user.idstr || user.uid || user.id || ''
  if (!uid) {
    return null
  }
  return {
    uid,
    name: user.screen_name || user.name || `User ${uid}`,
    avatar: user.avatar_hd || user.avatar || '',
  }
}

function normalizeText(post: Record<string, any>) {
  return post.text_raw || post.text || ''
}

function normalizeCreatedAt(post: Record<string, any>) {
  return post.created_at || post.createdAt || post.created || ''
}

function normalizePost(
  post: Record<string, any>,
  fallbackUser: UserRecord | null,
): PostRecord | null {
  const id = post.id || post.idstr || ''
  if (!id) {
    return null
  }
  const userId = post.userId || post.user_id || fallbackUser?.uid || ''
  const userName = post.userName || post.user_name || fallbackUser?.name || 'Unknown'
  const userAvatar = post.userAvatar || post.user_avatar || fallbackUser?.avatar || ''

  return {
    id,
    userId,
    userName,
    userAvatar,
    createdAt: normalizeCreatedAt(post),
    text: normalizeText(post),
    imgs: normalizeImages(post.imgs || post.pics || []),
    raw: post,
  }
}

export async function handleImport(file: File) {
  const text = await file.text()
  const payload = JSON.parse(text) as ArchivePayload

  const user = normalizeUser(payload.user)
  if (user) {
    await db.users.put(user)
  }

  const posts = (payload.weibo || [])
    .map((post) => normalizePost(post, user))
    .filter((post): post is PostRecord => Boolean(post))

  if (posts.length > 0) {
    await db.posts.bulkPut(posts)
  }

  return {
    users: user ? 1 : 0,
    posts: posts.length,
  }
}
