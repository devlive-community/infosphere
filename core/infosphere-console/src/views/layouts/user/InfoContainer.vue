<template>
  <div>
    <LayoutHeader/>
    <div class="flex flex-row space-x-3 justify-center mt-5 min-h-[700px]">
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
                         $route.path === `/user/${username}/follow` && 'bg-muted hover:bg-muted rounded-sm')">
            <RouterLink class="flex items-center space-x-2" :to="`/user/${username}/follow`">
              <HeartIcon :size="18"/>
              <span>关注</span>
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
import { HeartIcon, ShareIcon } from 'lucide-vue-next'
import { cn } from '@/lib/utils.ts'

export default defineComponent({
  name: 'InfoContainer',
  methods: { cn },
  components: {
    HeartIcon, ShareIcon,
    UserSidebar,
    LayoutFooter, LayoutHeader
  },
  data()
  {
    return {
      username: null as unknown as string
    }
  },
  created()
  {
    this.username = this.$route.params.username as string
  }
})
</script>