import { createApp } from 'vue'
import dayjs from 'dayjs'
import './style.css'
import App from './App.vue'

document.title = `${dayjs().format('M月D日')} | 那年今日`

createApp(App).mount('#app')
