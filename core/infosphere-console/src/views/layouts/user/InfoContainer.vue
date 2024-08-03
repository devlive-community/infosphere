<template>
  <div>
    <LayoutHeader/>
    <div class="flex flex-row space-x-3 justify-center mt-5 min-h-[700px] px-3">
      <div class="w-[300px]">
        <UserSidebar/>
      </div>
      <div class="flex-1 max-w-5xl space-y-2">
        <ul class="flex flex-row space-x-3 items-center">
          <li :class="cn('border-gray-300 py-1.5 px-3',
                          $route.path === `/user/${username}` && 'bg-muted hover:bg-muted rounded-sm')">
            <RouterLink class="flex items-center space-x-2" :to="`/user/${username}`">
              <ShareIcon :size="18"/>
              <span>分享</span>
            </RouterLink>
          </li>
          <li :class="cn('border-gray-300 py-1.5 px-3',
                         $route.path === `/user/${username}/follow/books` && 'bg-muted hover:bg-muted rounded-sm')">
            <RouterLink class="flex items-center space-x-2" :to="`/user/${username}/follow/books`">
              <BookIcon :size="18"/>
              <span>关注 (书籍)</span>
            </RouterLink>
          </li>
          <li :class="cn('border-gray-300 py-1.5 px-3',
                          $route.path === `/user/${username}/follow/users` && 'bg-muted hover:bg-muted rounded-sm')">
            <RouterLink class="flex items-center space-x-2" :to="`/user/${username}/follow/users`">
              <UserIcon :size="18"/>
              <span>关注 (用户)</span>
            </RouterLink>
          </li>
          <li :class="cn('border-gray-300 py-1.5 px-3',
                          $route.path === `/user/${username}/fans` && 'bg-muted hover:bg-muted rounded-sm')">
            <RouterLink class="flex items-center space-x-2" :to="`/user/${username}/fans`">
              <UsersIcon :size="18"/>
              <span>粉丝</span>
            </RouterLink>
          </li>
        </ul>
        <RouterView/>
      </div>
    </div>
  </div>
  <LayoutFooter class="mt-2"/>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import LayoutHeader from '@/views/layouts/basic/components/LayoutHeader.vue'
import LayoutFooter from '@/views/layouts/basic/components/LayoutFooter.vue'
import UserSidebar from '@/views/layouts/user/components/UserSidebar.vue'
import { BookIcon, ShareIcon, UserIcon, UsersIcon } from 'lucide-vue-next'
import { cn } from '@/lib/utils.ts'
import { RouterUtils } from '@/lib/router.ts'

export default defineComponent({
  name: 'InfoContainer',
  methods: { cn },
  components: {
    UserIcon, ShareIcon, BookIcon, UsersIcon,
    UserSidebar,
    LayoutFooter, LayoutHeader
  },
  data()
  {
    return {
      username: null as unknown as string
    }
  },
  watch: {
    '$route.params.username'(newUsername: string)
    {
      this.username = newUsername
    }
  },
  created()
  {
    this.username = RouterUtils.getParams('username')
  }
})
</script>