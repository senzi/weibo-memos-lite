<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { Bookmark, BookmarkCheck, CalendarDays, Database, Upload, Users } from 'lucide-vue-next'
import { db, type PostRecord, type UserRecord } from '@/db'
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
const noImageMode = ref(false)
const userMode = ref<'all' | 'single'>('all')
const selectedUserId = ref('')
const users = ref<UserRecord[]>([])
const showUserManager = ref(false)

const todayLabel = computed(() => dayjs().format('MM月DD日'))

const visibleUsers = computed(() => users.value.filter((user) => !user.hidden))
const hiddenUserIds = computed(() => new Set(users.value.filter((user) => user.hidden).map((user) => user.uid)))

async function refreshStats() {
  const [usersCount, posts] = await Promise.all([
    db.users.where('hidden').notEqual(true).count(),
    db.posts.count(),
  ])
  stats.value = { users: usersCount, posts }
}

async function fetchUsers() {
  const list = await db.users.toArray()
  users.value = list
  if (userMode.value === 'single') {
    const hasSelected = list.some((item) => item.uid === selectedUserId.value && !item.hidden)
    if (!hasSelected) {
      selectedUserId.value = visibleUsers.value[0]?.uid || ''
    }
  }
}

async function fetchTodayMemos() {
  const today = dayjs()
  const todayKey = today.format('MM-DD')
  const allPosts = await db.posts.toArray()
  const filterUserId = userMode.value === 'single' ? selectedUserId.value : ''
  memos.value = allPosts
    .filter((post) => {
      const date = dayjs(post.createdAt)
      if (!date.isValid()) {
        return false
      }
      if (date.format('MM-DD') !== todayKey || date.year() >= today.year()) {
        return false
      }
      if (hiddenUserIds.value.has(post.userId)) {
        return false
      }
      if (filterUserId && post.userId !== filterUserId) {
        return false
      }
      return true
    })
    .sort((a, b) => {
      const timeA = dayjs(a.createdAt)
      const timeB = dayjs(b.createdAt)
      const keyA = timeA.format('HH:mm:ss')
      const keyB = timeB.format('HH:mm:ss')
      if (keyA !== keyB) {
        return keyA.localeCompare(keyB)
      }
      return timeA.year() - timeB.year()
    })
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
    .filter((post) => !hiddenUserIds.value.has(post.userId))
}

async function refreshAll() {
  await Promise.all([refreshStats(), fetchUsers(), fetchTodayMemos(), fetchCollections()])
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
      importStatus.value = `导入失败：${file.name}，请检查 JSON 格式。`
    }
  }

  await refreshAll()
  if (userMode.value === 'single' && !selectedUserId.value) {
    selectedUserId.value = visibleUsers.value[0]?.uid || ''
  }
  if (!hadError) {
    importStatus.value = `已导入 ${totalUsers} 个用户，${totalPosts} 条微博。`
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

async function toggleUserHidden(uid: string) {
  const existing = await db.users.get(uid)
  if (!existing) {
    return
  }
  await db.users.put({ ...existing, hidden: !existing.hidden })
  await refreshAll()
}

function isCollected(postId: string) {
  return collectionIds.value.has(postId)
}

function openPreview(images: string[], index: number) {
  if (noImageMode.value) {
    return
  }
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

function formatDateTime(date: string) {
  const parsed = dayjs(date)
  return parsed.isValid() ? parsed.format('YYYY年MM月DD日 HH:mm') : date
}

function yearsAgoLabel(date: string) {
  const parsed = dayjs(date)
  if (!parsed.isValid()) {
    return ''
  }
  const years = Math.max(0, dayjs().year() - parsed.year())
  return `${years}年前`
}

function getRetweet(post: PostRecord) {
  const raw = post.raw as Record<string, any>
  return raw?.retweet || raw?.retweeted_status || null
}

function getPostUrl(post: PostRecord) {
  const raw = post.raw as Record<string, any>
  const uid = post.userId || raw?.user?.idstr || raw?.user?.id || ''
  const mblogid = raw?.mblogid || raw?.mblogId || ''
  if (!uid || !mblogid) {
    return ''
  }
  return `https://weibo.com/${uid}/${mblogid}`
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
  const storedNoImage = localStorage.getItem('weibo-memos-lite:no-image')
  noImageMode.value = storedNoImage === '1'
  await refreshAll()
  emitter.on('open-image-preview', handleOpenPreview)
})

onUnmounted(() => {
  emitter.off('open-image-preview', handleOpenPreview)
})

watch(noImageMode, (enabled) => {
  if (enabled) {
    closePreview()
  }
  localStorage.setItem('weibo-memos-lite:no-image', enabled ? '1' : '0')
})

watch([userMode, selectedUserId], async () => {
  await fetchTodayMemos()
})
</script>

<template>
  <div class="app">
    <header class="hero">
      <div class="hero-content">
        <div class="top-controls">
          <label class="toggle">
            <input v-model="noImageMode" type="checkbox">
            <span class="toggle-track"></span>
            <span>无图模式</span>
          </label>
          <div class="filter-group">
            <select v-model="userMode" class="select">
              <option value="all">全部用户</option>
              <option value="single">单用户</option>
            </select>
            <select v-if="userMode === 'single'" v-model="selectedUserId" class="select">
              <option value="" disabled>选择用户</option>
              <option v-for="user in visibleUsers" :key="user.uid" :value="user.uid">
                {{ user.name }}
              </option>
            </select>
          </div>
        </div>
        <p class="eyebrow">微博回忆轻量版</p>
        <h1>那年今日，见字如面。</h1>
        <p class="hero-subtitle">
          从本地存档中，打捞历年今日的每一条动态。
        </p>
        <div class="hero-actions">
          <label class="upload-button">
            <input type="file" accept="application/json" multiple @change="handleFileChange">
            <Upload class="icon" />
            <span>{{ isImporting ? '正在导入...' : '导入 JSON' }}</span>
          </label>
          <p class="hint">数据仅保存在本地浏览器（IndexedDB）。</p>
          <p class="hint">
            仅兼容
            <a
              href="https://github.com/Chilfish/weibo-archiver"
              target="_blank"
              rel="noopener noreferrer"
              class="hint-link"
            >
              weibo-archiver
            </a>
            的导出格式。
          </p>
        </div>
      </div>
      <div class="hero-panel">
        <div class="panel">
          <div class="panel-header">
            <CalendarDays class="icon" />
            <span>今天</span>
          </div>
          <div class="panel-value">{{ todayLabel }}</div>
          <p class="panel-meta">展示历年今天发布的微博。</p>
        </div>
        <div class="panel-grid">
          <div class="panel mini">
            <button class="panel-button" type="button" @click="showUserManager = true">
              <Users class="icon muted" />
              <div>
                <p class="panel-label">用户数</p>
                <p class="panel-value">{{ stats.users }}</p>
              </div>
            </button>
          </div>
          <div class="panel mini">
            <Database class="icon muted" />
            <div>
              <p class="panel-label">微博数</p>
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
            今日回忆
          </button>
          <button
            class="tab"
            :class="{ active: viewMode === 'collections' }"
            @click="viewMode = 'collections'"
          >
            已收藏
          </button>
        </div>
        <p class="content-meta">
          共 {{ viewMode === 'today' ? memos.length : collectionMemos.length }} 条
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
                <p class="memo-date">
                  <span class="time-tag">{{ yearsAgoLabel(post.createdAt) }}</span>
                  {{ formatDateTime(post.createdAt) }}
                </p>
              </div>
            </div>
            <div class="memo-actions">
              <button class="collect" @click="toggleCollection(post.id)">
                <BookmarkCheck v-if="isCollected(post.id)" class="icon" />
                <Bookmark v-else class="icon" />
                <span>{{ isCollected(post.id) ? '已收藏' : '收藏' }}</span>
              </button>
              <a
                v-if="getPostUrl(post)"
                class="memo-link"
                :href="getPostUrl(post)"
                target="_blank"
                rel="noopener noreferrer"
              >
                原微博
              </a>
            </div>
          </header>

          <WeiboText class="memo-text" :text="post.text" :show-images="!noImageMode" />

          <div v-if="!noImageMode && post.imgs.length" class="memo-grid">
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
              转发自 {{ getRetweet(post).user?.name || getRetweet(post).user?.screen_name || '未知用户' }}
            </p>
            <WeiboText class="memo-text" :text="getRetweet(post).text || ''" :show-images="!noImageMode" />
            <div v-if="!noImageMode && getRetweetImages(getRetweet(post)).length" class="memo-grid">
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
          <p>暂无回忆，先导入微博存档。</p>
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
                <p class="memo-date">
                  <span class="time-tag">{{ yearsAgoLabel(post.createdAt) }}</span>
                  {{ formatDateTime(post.createdAt) }}
                </p>
              </div>
            </div>
            <div class="memo-actions">
              <button class="collect" @click="toggleCollection(post.id)">
                <BookmarkCheck class="icon" />
                <span>已收藏</span>
              </button>
              <a
                v-if="getPostUrl(post)"
                class="memo-link"
                :href="getPostUrl(post)"
                target="_blank"
                rel="noopener noreferrer"
              >
                原微博
              </a>
            </div>
          </header>

          <WeiboText class="memo-text" :text="post.text" :show-images="!noImageMode" />

          <div v-if="!noImageMode && post.imgs.length" class="memo-grid">
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
          <p>暂无收藏，点击收藏按钮即可保存。</p>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="footer-top">
        <a
          href="https://github.com/senzi/weibo-memos-lite"
          target="_blank"
          rel="noopener noreferrer"
          class="footer-link"
        >
          senzi/weibo-memos-lite (MIT)
        </a>
        <span class="footer-badge">Vibe Coding</span>
      </div>

      <div class="footer-meta">
        <p>© 2025 · Built with ❤️</p>
        <p>
          Core components inspired by
          <a
            href="https://github.com/Chilfish/weibo-archiver"
            target="_blank"
            rel="noopener noreferrer"
            class="footer-underline"
          >
            weibo-archiver
          </a>
          under Apache-2.0.
        </p>
      </div>
    </footer>

    <div v-if="preview.open" class="preview">
      <div class="preview-backdrop" @click="closePreview"></div>
      <div class="preview-card">
        <button class="preview-close" type="button" @click="closePreview">关闭</button>
        <button v-if="preview.images.length > 1" class="preview-nav left" type="button" @click="prevPreview">
          上一张
        </button>
        <img :src="getCdnUrl(preview.images[preview.index])" alt="Preview image">
        <button v-if="preview.images.length > 1" class="preview-nav right" type="button" @click="nextPreview">
          下一张
        </button>
      </div>
    </div>

    <div v-if="showUserManager" class="modal">
      <div class="preview-backdrop" @click="showUserManager = false"></div>
      <div class="modal-card">
        <div class="modal-header">
          <h2>管理用户</h2>
          <button type="button" class="modal-close" @click="showUserManager = false">关闭</button>
        </div>
        <p class="modal-hint">隐藏的用户不会出现在首页，也无法被筛选。</p>
        <div class="user-list">
          <div v-for="user in users" :key="user.uid" class="user-item">
            <div class="user-info">
              <img class="avatar small" :src="getCdnUrl(user.avatar)" :alt="user.name">
              <div>
                <p class="user-name">{{ user.name }}</p>
                <p class="user-id">UID: {{ user.uid }}</p>
              </div>
            </div>
            <button class="user-toggle" type="button" @click="toggleUserHidden(user.uid)">
              {{ user.hidden ? '显示' : '隐藏' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
