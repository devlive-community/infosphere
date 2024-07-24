<template>
  <div v-if="item" class="flex p-1 space-x-2">
    <div class="w-36 h-48">
      <AspectRatio class="w-full h-48">
        <img :src="item.cover ? item.cover : '/static/images/default-cover.png'" :alt="item.name" class="rounded-md w-full h-full border-2"/>
      </AspectRatio>
    </div>
    <InfoSphereCard class="flex-1 border-0">
      <template #title>
        <div class="space-y-1.5">
          <RouterLink :to="`/book/info/${item.identify}`" class="flex items-center space-x-2 hover:text-blue-400">
            <span>{{ item.name }}</span>
          </RouterLink>
        </div>
      </template>
      <template #description>
        <div class="flex h-5 items-center space-x-4 text-sm mt-2">
          <InfoSphereTooltip>
            <template #title>
              <div class="flex items-center space-x-2">
                <FileTextIcon class="w-4 h-4"/>
                <span>{{ item.documentCount }}</span>
              </div>
            </template>
            <template #content>
              文档数量
            </template>
          </InfoSphereTooltip>
          <Separator orientation="vertical"/>
          <InfoSphereTooltip>
            <template #title>
              <div class="flex items-center space-x-2">
                <EyeIcon class="w-4 h-4"/>
                <span>{{ item.visitorCount }}</span>
              </div>
            </template>
            <template #content>阅读人次</template>
          </InfoSphereTooltip>
          <Separator orientation="vertical"/>
          <InfoSphereTooltip>
            <template #title>
              <div class="flex items-center space-x-2">
                <ClockIcon class="w-4 h-4"/>
                <span>{{ item.createTime }}</span>
              </div>
            </template>
            <template #content>
              创建时间
            </template>
          </InfoSphereTooltip>
        </div>
      </template>
      <div class="pt-2 pb-5 text-gray-400">{{ item.description ? item.description : '暂无描述' }}</div>
    </InfoSphereCard>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import InfoSphereCard from '@/views/components/card/InfoSphereCard.vue'
import { Book } from '@/model/book.ts'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { ClockIcon, EyeIcon, FileTextIcon } from 'lucide-vue-next'
import InfoSphereTooltip from '@/views/components/tooltip/InfoSphereTooltip.vue'
import { Separator } from '@/components/ui/separator'

export default defineComponent({
  name: 'BookWithCoverItem',
  components: { Separator, InfoSphereTooltip, EyeIcon, FileTextIcon, ClockIcon, AspectRatio, InfoSphereCard },
  props: {
    item: {
      type: Object as () => Book,
      required: true
    }
  }
})
</script>
