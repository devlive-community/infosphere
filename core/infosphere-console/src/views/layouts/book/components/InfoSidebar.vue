<template>
  <div class="flex max-h-screen flex-col gap-2">
    <div class="flex h-14 items-center justify-center border-b px-4 lg:h-[60px] lg:px-6">
      <div class="flex items-center gap-2 font-semibold">
        <BookIcon class="h-6 w-6"/>
        <span class="">书籍详情</span>
      </div>
    </div>
    <div class="flex-1">
      <nav class="grid items-start px-2 text-sm font-medium lg:px-4 space-y-2">
        <RouterLink v-for="item in items" :to="item.href"
                    :class="cn('flex justify-center items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:bg-primary-foreground', $route.path === `${item.href}` && 'bg-muted hover:bg-muted')">
          {{ item.title }}
        </RouterLink>
      </nav>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { cn } from '@/lib/utils.ts'
import { BookIcon } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

interface NavigationItem
{
  title: string
  href: string
}

export default defineComponent({
  name: 'InfoSidebar',
  components: { BookIcon },
  setup()
  {
    return {
      cn
    }
  },
  data()
  {
    return {
      items: [] as NavigationItem[]
    }
  },
  created()
  {
    this.initialize()
  },
  methods: {
    initialize()
    {
      const router = useRouter()
      const params = router.currentRoute.value.params
      const identify = params['identify'] as string

      const items: NavigationItem[] = []
      if (identify) {
        items.push({ title: '书籍摘要', href: `/book/setting/summary/${ identify }` })
        items.push({ title: '书籍状态', href: `/book/setting/status/${ identify }` })
      }
      items.push({ title: '书籍设置', href: identify ? `/book/setting/${ identify }` : '/book/setting' })
      this.items = [...items]
    }
  }
})
</script>
