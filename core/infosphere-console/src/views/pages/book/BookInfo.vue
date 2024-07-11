<template>
  <div class="flex flex-col space-y-8 lg:flex-row justify-center lg:space-x-12 lg:space-y-0 mt-5 min-h-[700px]">
    <div class="flex-1 lg:max-w-7xl">
      <InfoSphereLoading v-if="loading" :show="loading"/>
      <Card v-else class="w-full rounded-sm border-0 shadow-background">
        <CardHeader class="p-3 space-y-1.5">
          <CardTitle class="space-x-4 flex items-center">
            <span class="font-bold text-2xl">{{ info.name }}</span>
            <div class="items-center">
              <InfoSphereTooltip>
                <template #title>
                  <RouterLink :to="`/book/setting/${info.identify}`">
                    <SettingsIcon class="w-4 h-4"/>
                  </RouterLink>
                </template>
                <template #content>
                  书籍设置
                </template>
              </InfoSphereTooltip>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent class="p-3 pl-6 pr-6 space-y-6">
          <div class="flex w-full">
            <div class="w-44 h-64">
              <AspectRatio class="w-full h-64">
                <img :src="info.cover ? info.cover : '/images/default-cover.png'" :alt="info.name" class="rounded-md w-full h-full border-2"/>
              </AspectRatio>
            </div>
            <div class="flex-1 pl-10 space-y-3">
              <div class="flex items-center space-x-6">
                <Label class="text-gray-400">书籍作者:</Label>
                <span>{{ info.user?.username }}</span>
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
        <CardFooter class="flex justify-between p-3">
          <Tabs default-value="content" class="w-[400px]">
            <TabsList>
              <TabsTrigger value="content">
                书籍目录
              </TabsTrigger>
            </TabsList>
            <TabsContent value="content">
            </TabsContent>
          </Tabs>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import InfoSphereTooltip from '@/views/components/tooltip/InfoSphereTooltip.vue'
import { Button } from '@/components/ui/button'
import { useRouter } from 'vue-router'
import BookService from '@/service/book'
import { Book } from '@/model/book.ts'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { SettingsIcon } from 'lucide-vue-next'
import { AspectRatio } from '@/components/ui/aspect-ratio'

export default defineComponent({
  name: 'BookInfo',
  components: {
    Separator,
    Label,
    InfoSphereLoading,
    CardFooter, CardTitle, CardContent, CardHeader, Card,
    Button, InfoSphereTooltip,
    Tabs, TabsContent, TabsList, TabsTrigger,
    AspectRatio,
    SettingsIcon
  },
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
