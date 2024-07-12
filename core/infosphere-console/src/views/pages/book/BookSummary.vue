<template>
  <InfoSphereLoading v-if="loading" :show="loading"/>
  <Card v-else class="w-full rounded-sm border-0 shadow-background">
    <CardHeader class="space-y-1.5 p-0">
      <CardTitle class="space-x-4 flex items-center">
        <LockOpenIcon v-if="info.visibility" class="w-5 h-5"/>
        <LockIcon v-else class="w-5 h-5"/>
        <span class="font-bold text-2xl">{{ info.name }}</span>
      </CardTitle>
    </CardHeader>
    <Separator class="mt-2 mb-1 bg-gray-100"/>
    <CardContent class="p-3 pl-6 pr-6 space-y-6">
      <div class="flex w-full">
        <div class="w-44 h-64">
          <AspectRatio class="w-full h-64">
            <img :src="info.cover ? info.cover : '/static/images/default-cover.png'" :alt="info.name" class="rounded-md w-full h-full border-2"/>
          </AspectRatio>
        </div>
        <div class="flex-1 pl-10 space-y-3">
          <div class="flex items-center space-x-6">
            <Label class="text-gray-400">书籍作者:</Label>
            <span>{{ info.user?.username }}</span>
          </div>
          <Separator class="bg-gray-100"/>
          <div class="flex items-center space-x-6">
            <Label class="text-gray-400">文档数量:</Label>
            <span>{{ info.documentCount }}</span>
          </div>
          <Separator class="bg-gray-100"/>
          <div class="flex items-center space-x-6">
            <Label class="text-gray-400">创建时间:</Label>
            <span>{{ info.createTime }}</span>
          </div>
          <Separator class="bg-gray-100"/>
          <div class="flex items-center space-x-6">
            <Label class="text-gray-400">更新时间:</Label>
            <span>{{ info.updateTime }}</span>
          </div>
        </div>
      </div>
      <div class="grid items-center w-full gap-4">
        <Label>书籍描述</Label>
        <div class="text-gray-400 pl-6 pr-6">
          {{ info.description ? info.description : '暂无描述' }}
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'
import { Tabs } from '@/components/ui/tabs'
import { LockIcon, LockOpenIcon, SettingsIcon } from 'lucide-vue-next'
import InfoSphereTooltip from '@/views/components/tooltip/InfoSphereTooltip.vue'
import { Book } from '@/model/book.ts'
import { useRouter } from 'vue-router'
import BookService from '@/service/book.ts'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'

export default defineComponent({
  name: 'BookSummary',
  components: { Label, Separator, LockIcon, LockOpenIcon, CardContent, CardFooter, InfoSphereTooltip, SettingsIcon, Tabs, InfoSphereLoading, CardTitle, CardHeader, Card },
  data()
  {
    return {
      loading: false,
      info: null as unknown as Book
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

      this.loading = true
      BookService.getByIdentify(identify)
                 .then(response => {
                   this.info = response.data
                 })
                 .finally(() => this.loading = false)
    }
  }
})
</script>
