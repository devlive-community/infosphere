<template>
  <div class="w-full space-y-2 pb-5">
    <ul class="flex flex-row space-x-3 items-center">
      <li :class="cn('border-gray-300 py-1.5 px-3',
                     $route.path === `/book/info/${identify}` && 'bg-muted hover:bg-muted rounded-sm')">
        <RouterLink class="flex items-center space-x-2" :to="`/book/info/${identify}`">
          <ListIcon :size="18"/>
          <span>书籍目录</span>
        </RouterLink>
      </li>
      <li v-if="loggedIn" :class="cn('border-gray-300 py-1.5 px-3',
                                     $route.path === `/book/access/${identify}` && 'bg-muted hover:bg-muted rounded-sm')">
        <RouterLink class="flex items-center space-x-2" :to="`/book/access/${identify}`">
          <HistoryIcon :size="18"/>
          <span>访问记录</span>
        </RouterLink>
      </li>
      <li :class="cn('border-gray-300 py-1.5 px-3',
                     $route.path === `/book/follow/${identify}` && 'bg-muted hover:bg-muted rounded-sm')">
        <RouterLink class="flex items-center space-x-2" :to="`/book/follow/${identify}`">
          <UserIcon :size="18"/>
          <span>关注用户</span>
        </RouterLink>
      </li>
      <li :class="cn('border-gray-300 py-1.5 px-3',
                     $route.path === `/book/comment/${identify}` && 'bg-muted hover:bg-muted rounded-sm')">
        <RouterLink class="flex items-center space-x-2" :to="`/book/comment/${identify}`">
          <MessageSquare :size="18"/>
          <span>书籍评论</span>
        </RouterLink>
      </li>
    </ul>
    <RouterView/>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { HistoryIcon, ListIcon, MessageSquare, UserIcon } from 'lucide-vue-next'
import { cn } from '@/lib/utils.ts'
import { RouterUtils } from '@/lib/router.ts'
import { useUserStore } from '@/stores/user.ts'

export default defineComponent({
  name: 'MenuSidebar',
  components: { ListIcon, HistoryIcon, UserIcon, MessageSquare },
  data()
  {
    return {
      loggedIn: false,
      identify: null as unknown as string
    }
  },
  created()
  {
    const userStore = useUserStore()
    this.loggedIn = userStore.isLogin
    this.identify = RouterUtils.getParams('identify')
  },
  methods: { cn }
})
</script>
