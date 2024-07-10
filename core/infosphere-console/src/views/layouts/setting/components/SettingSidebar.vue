<template>
  <nav class="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
    <div v-for="item in items">
      <div v-if="item.isDriver" class="mt-2 mb-2">
        <Separator class="right"/>
      </div>
      <Button v-else :key="item.title" variant="ghost" :class="cn('w-full text-left justify-start', $route.path === `${item.href}` && 'bg-muted hover:bg-muted',)">
        <RouterLink :to="item.href as string" class="w-full">{{ item.title }}</RouterLink>
      </Button>
    </div>
  </nav>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

interface NavigationItem
{
  title?: string
  href?: string
  isDriver?: boolean
}

export default defineComponent({
  name: 'SettingSidebar',
  components: { Separator, Button },
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
      const items: NavigationItem[] = [
        { title: '基本信息', href: '/setting/index' },
        { title: '修改密码', href: '/setting/password' }
      ]
      this.items = [...items]
    }
  }
})
</script>
