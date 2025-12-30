import Dexie, { type Table } from 'dexie'

export type UserRecord = {
  uid: string
  name: string
  avatar: string
  hidden?: boolean
}

export type PostRecord = {
  id: string
  userId: string
  userName: string
  userAvatar: string
  createdAt: string
  text: string
  imgs: string[]
  raw: unknown
}

export type CollectionRecord = {
  postId: string
  addedAt: number
}

export class MemosDB extends Dexie {
  posts!: Table<PostRecord>
  users!: Table<UserRecord>
  collections!: Table<CollectionRecord>

  constructor() {
    super('WeiboMemosLite')
    this.version(1).stores({
      posts: 'id, userId, createdAt',
      users: 'uid',
      collections: 'postId, addedAt',
    })
    this.version(2).stores({
      posts: 'id, userId, createdAt',
      users: 'uid, hidden',
      collections: 'postId, addedAt',
    })
  }
}

export const db = new MemosDB()
