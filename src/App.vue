<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Bookmark, BookmarkCheck, CalendarDays, Database, Upload, Users } from 'lucide-vue-next'
import { db, type PostRecord } from '@/db'
import { handleImport } from '@/utils/import'
import { getCdnUrl, normalizeImages } from '@/utils/image'
import { emitter } from '@/composables'
import { WeiboText } from '@/components/weibo/WeiboText'

type PreviewState = {
  open: boolean
  images: string[]
  index: number
}

const isImporting = ref(false)
const importStatus = ref('')
const viewMode = ref<'today' | 'collections'>('today')
const memos = ref<PostRecord[]>([])
const collectionMemos = ref<PostRecord[]>([])
const collectionIds = ref<Set<string>>(new Set())
const stats = ref({ users: 0, posts: 0 })
const preview = ref<PreviewState>({ open: false, images: [], index: 0 })

const todayLabel = computed(() => dayjs().format('MMMM DD'))

async function refreshStats() {
  const [users, posts] = await Promise.all([db.users.count(), db.posts.count()])
  stats.value = { users, posts }
}

async function fetchTodayMemos() {
  const today = dayjs()
  const todayKey = today.format('MM-DD')
  const allPosts = await db.posts.toArray()
  memos.value = allPosts
    .filter((post) => {
      const date = dayjs(post.createdAt)
      return date.isValid() && date.format('MM-DD') === todayKey && date.year() < today.year()
    })
    .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
}

async function fetchCollections() {
  const records = await db.collections.toArray()
  const ids = new Set(records.map((record) => record.postId))
  collectionIds.value = ids
  if (ids.size === 0) {
    collectionMemos.value = []
    return
  }
  const posts = await db.posts.bulkGet([...ids])
  collectionMemos.value = posts.filter((post): post is PostRecord => Boolean(post))
}

async function refreshAll() {
  await Promise.all([refreshStats(), fetchTodayMemos(), fetchCollections()])
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length === 0) {
    return
  }

  isImporting.value = true
  importStatus.value = ''
  let totalUsers = 0
  let totalPosts = 0
  let hadError = false

  for (const file of files) {
    try {
      const result = await handleImport(file)
      totalUsers += result.users
      totalPosts += result.posts
    }
    catch (error) {
      hadError = true
      importStatus.value = `Failed to import ${file.name}. Please check the JSON format.`
    }
  }

  await refreshAll()
  if (!hadError) {
    importStatus.value = `Imported ${totalUsers} user(s) and ${totalPosts} post(s).`
  }
  isImporting.value = false
  input.value = ''
}

async function toggleCollection(postId: string) {
  const exists = await db.collections.get(postId)
  if (exists) {
    await db.collections.delete(postId)
  }
  else {
    await db.collections.put({ postId, addedAt: Date.now() })
  }
  await fetchCollections()
}

function isCollected(postId: string) {
  return collectionIds.value.has(postId)
}

function openPreview(images: string[], index: number) {
  preview.value = {
    open: true,
    images,
    index,
  }
}

function closePreview() {
  preview.value = { open: false, images: [], index: 0 }
}

function nextPreview() {
  preview.value = {
    ...preview.value,
    index: (preview.value.index + 1) % preview.value.images.length,
  }
}

function prevPreview() {
  const nextIndex = preview.value.index - 1
  preview.value = {
    ...preview.value,
    index: nextIndex < 0 ? preview.value.images.length - 1 : nextIndex,
  }
}

function formatDate(date: string) {
  const parsed = dayjs(date)
  return parsed.isValid() ? parsed.format('YYYY MMM DD') : date
}

function getRetweet(post: PostRecord) {
  const raw = post.raw as Record<string, any>
  return raw?.retweet || raw?.retweeted_status || null
}

function getRetweetImages(retweet: Record<string, any> | null) {
  if (!retweet) {
    return []
  }
  return normalizeImages(retweet.imgs || retweet.pics || [])
}

function handleOpenPreview(payload: { imgs: string[]; index: number }) {
  openPreview(payload.imgs, payload.index)
}

onMounted(async () => {
  await refreshAll()
  emitter.on('open-image-preview', handleOpenPreview)
})

onUnmounted(() => {
  emitter.off('open-image-preview', handleOpenPreview)
})
</script>

<template>
  <div class="app">
    <header class="hero">
      <div class="hero-content">
        <p class="eyebrow">Weibo Memos Lite</p>
        <h1>On this day, across every timeline.</h1>
        <p class="hero-subtitle">
          Import your Weibo archives and surface every shared memory that happened today.
        </p>
        <div class="hero-actions">
          <label class="upload-button">
            <input type="file" accept="application/json" multiple @change="handleFileChange">
            <Upload class="icon" />
            <span>{{ isImporting ? 'Importing...' : 'Import JSON' }}</span>
          </label>
          <p class="hint">Data stays in your browser via IndexedDB.</p>
        </div>
      </div>
      <div class="hero-panel">
        <div class="panel">
          <div class="panel-header">
            <CalendarDays class="icon" />
            <span>Today</span>
          </div>
          <div class="panel-value">{{ todayLabel }}</div>
          <p class="panel-meta">Showing posts from past years on this date.</p>
        </div>
        <div class="panel-grid">
          <div class="panel mini">
            <Users class="icon muted" />
            <div>
              <p class="panel-label">Users</p>
              <p class="panel-value">{{ stats.users }}</p>
            </div>
          </div>
          <div class="panel mini">
            <Database class="icon muted" />
            <div>
              <p class="panel-label">Posts</p>
              <p class="panel-value">{{ stats.posts }}</p>
            </div>
          </div>
        </div>
        <p v-if="importStatus" class="status">{{ importStatus }}</p>
      </div>
    </header>

    <main class="content">
      <div class="content-header">
        <div class="tabs">
          <button
            class="tab"
            :class="{ active: viewMode === 'today' }"
            @click="viewMode = 'today'"
          >
            Today
          </button>
          <button
            class="tab"
            :class="{ active: viewMode === 'collections' }"
            @click="viewMode = 'collections'"
          >
            Collections
          </button>
        </div>
        <p class="content-meta">
          {{ viewMode === 'today' ? memos.length : collectionMemos.length }} memo(s)
        </p>
      </div>

      <section v-if="viewMode === 'today'" class="memo-list">
        <article v-for="post in memos" :key="post.id" class="memo-card">
          <header class="memo-header">
            <div class="memo-user">
              <img
                class="avatar"
                :src="getCdnUrl(post.userAvatar)"
                :alt="post.userName"
              >
              <div>
                <p class="memo-user-name">{{ post.userName }}</p>
                <p class="memo-date">{{ formatDate(post.createdAt) }}</p>
              </div>
            </div>
            <button class="collect" @click="toggleCollection(post.id)">
              <BookmarkCheck v-if="isCollected(post.id)" class="icon" />
              <Bookmark v-else class="icon" />
              <span>{{ isCollected(post.id) ? 'Collected' : 'Collect' }}</span>
            </button>
          </header>

          <WeiboText class="memo-text" :text="post.text" />

          <div v-if="post.imgs.length" class="memo-grid">
            <button
              v-for="(img, index) in post.imgs"
              :key="img"
              type="button"
              class="memo-image"
              @click="openPreview(post.imgs, index)"
            >
              <img :src="getCdnUrl(img)" alt="Weibo image">
            </button>
          </div>

          <div v-if="getRetweet(post)" class="memo-retweet">
            <p class="retweet-title">
              Repost from {{ getRetweet(post).user?.name || getRetweet(post).user?.screen_name || 'Unknown' }}
            </p>
            <WeiboText class="memo-text" :text="getRetweet(post).text || ''" />
            <div v-if="getRetweetImages(getRetweet(post)).length" class="memo-grid">
              <button
                v-for="(img, index) in getRetweetImages(getRetweet(post))"
                :key="img"
                type="button"
                class="memo-image"
                @click="openPreview(getRetweetImages(getRetweet(post)), index)"
              >
                <img :src="getCdnUrl(img)" alt="Weibo image">
              </button>
            </div>
          </div>
        </article>

        <div v-if="memos.length === 0" class="empty-state">
          <p>No memories yet. Import your archives to begin.</p>
        </div>
      </section>

      <section v-else class="memo-list">
        <article v-for="post in collectionMemos" :key="post.id" class="memo-card">
          <header class="memo-header">
            <div class="memo-user">
              <img
                class="avatar"
                :src="getCdnUrl(post.userAvatar)"
                :alt="post.userName"
              >
              <div>
                <p class="memo-user-name">{{ post.userName }}</p>
                <p class="memo-date">{{ formatDate(post.createdAt) }}</p>
              </div>
            </div>
            <button class="collect" @click="toggleCollection(post.id)">
              <BookmarkCheck class="icon" />
              <span>Collected</span>
            </button>
          </header>

          <WeiboText class="memo-text" :text="post.text" />

          <div v-if="post.imgs.length" class="memo-grid">
            <button
              v-for="(img, index) in post.imgs"
              :key="img"
              type="button"
              class="memo-image"
              @click="openPreview(post.imgs, index)"
            >
              <img :src="getCdnUrl(img)" alt="Weibo image">
            </button>
          </div>
        </article>

        <div v-if="collectionMemos.length === 0" class="empty-state">
          <p>No collections yet. Tap Collect on a memo to save it.</p>
        </div>
      </section>
    </main>

    <div v-if="preview.open" class="preview">
      <div class="preview-backdrop" @click="closePreview"></div>
      <div class="preview-card">
        <button class="preview-close" type="button" @click="closePreview">Close</button>
        <button v-if="preview.images.length > 1" class="preview-nav left" type="button" @click="prevPreview">
          Prev
        </button>
        <img :src="getCdnUrl(preview.images[preview.index])" alt="Preview image">
        <button v-if="preview.images.length > 1" class="preview-nav right" type="button" @click="nextPreview">
          Next
        </button>
      </div>
    </div>
  </div>
</template>
