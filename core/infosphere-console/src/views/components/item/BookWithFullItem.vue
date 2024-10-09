<template>
  <InfoSphereCard v-if="info" class="w-full rounded-sm border-0 shadow-background">
    <template #title>
      <div class="space-x-4 flex items-center">
        <LockOpenIcon v-if="info.visibility" class="w-5 h-5"/>
        <LockIcon v-else class="w-5 h-5"/>
        <span class="font-bold text-2xl">{{ info.name }}</span>
      </div>
    </template>
    <Separator class="mt-2 mb-1 bg-gray-100"/>
    <div class="p-3 pl-6 pr-6 space-y-6">
      <div class="flex w-full">
        <div class="w-44 h-68">
          <img :src="info.cover ? info.cover : '/static/images/default-cover.png'" :alt="info.name" class="rounded-md w-full h-full border-2"/>
        </div>
        <div class="flex-1 pl-10 space-y-2">
          <div class="flex items-center space-x-6">
            <Label class="text-gray-400">书籍作者:</Label>
            <RouterLink :to="`/user/${info.user?.username}`" class="text-blue-400 hover:border-b hover:border-b-blue-400">
              {{ info.user?.username }}
            </RouterLink>
          </div>
          <Separator class="bg-gray-100"/>
          <div class="flex items-center space-x-6">
            <Label class="text-gray-400">书籍语言:</Label>
            <div class="text-sm text-gray-600">
              <span v-if="info.language === 'en'">英文</span>
              <span v-if="info.language === 'zh-cn'">简体中文</span>
              <span v-if="info.language === 'zh-hk'">繁体中文（香港）</span>
              <span v-if="info.language === 'zh-tw'">繁体中文（台湾）</span>
            </div>
          </div>
          <Separator class="bg-gray-100"/>
          <div class="flex items-center space-x-6">
            <Label class="text-gray-400">文档数量:</Label>
            <span>{{ info.documentCount }}</span>
          </div>
          <Separator class="bg-gray-100"/>
          <div class="flex items-center space-x-6">
            <Label class="text-gray-400">阅读人次:</Label>
            <span>{{ info.visitorCount }}</span>
          </div>
          <Separator class="bg-gray-100"/>
          <div class="flex items-center space-x-6">
            <Label class="text-gray-400">书籍来源:</Label>
            <div v-if="info.originate">
              <a :href="info.originate.value" target="_blank" class="text-sm text-blue-400 hover:border-b hover:border-b-blue-400">{{ info.originate.field }}</a>
            </div>
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
          <Separator class="bg-gray-100"/>
        </div>
      </div>
      <div class="grid items-center w-full gap-4">
        <Label class="-ml-5">书籍描述</Label>
        <div class="text-gray-400 p-4">
          {{ info.description ? info.description : '暂无描述' }}
        </div>
      </div>
    </div>
  </InfoSphereCard>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Book } from '@/model/book.ts'
import InfoSphereCard from '@/views/components/card/InfoSphereCard.vue'
import { LockIcon, LockOpenIcon } from 'lucide-vue-next'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'

export default defineComponent({
  name: 'BookWithFullItem',
  components: {
    Label,
    LockIcon, LockOpenIcon,
    Separator,
    InfoSphereCard
  },
  props: {
    info: {
      type: Object as () => Book,
      required: true
    }
  }
})
</script>
