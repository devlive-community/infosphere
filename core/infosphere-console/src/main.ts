import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/index.css'
import App from './App.vue'
import router from '@/router'
import Vue3Toasity, { type ToastContainerOptions } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(Vue3Toasity, { autoClose: 2000, position: 'top-center', hideProgressBar: true, transition: 'flip', theme: 'colored' } as ToastContainerOptions)
app.mount('#app')
