<template>
  <RouterLink :to="`/book/info/${item.identify}`">
    <InfoSphereTooltip position="top">
      <template #title>
        <div class="w-full h-48 relative">
          <div class="absolute top-0 right-0 pl-1 pr-1 -mt-0.5 m-0.5 bg-white bg-opacity-30 rounded">
            <span v-if="item.state === 'STARTED'" class="text-xs text-cyan-600 font-bold">开始中</span>
            <span v-else-if="item.state === 'PAUSED'" class="text-xs text-amber-600 font-bold">暂停中</span>
            <span v-else-if="item.state === 'STOPPED'" class="text-xs text-red-600 font-bold">已停止</span>
            <span v-else-if="item.state === 'FINISHED'" class="text-xs text-green-600 font-bold">已完成</span>
          </div>
          <AspectRatio class="w-full h-full">
            <img :src="item.cover ? item.cover : '/static/images/default-cover.png'" :alt="item.name" class="rounded-md w-full h-full border-2"/>
          </AspectRatio>
          <span class="font-normal text-gray-500 text-xs text-center">{{ item.name }}</span>
        </div>
      </template>
      <template #content>
        {{ item.name }}
      </template>
    </InfoSphereTooltip>
  </RouterLink>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Book } from '@/model/book.ts'
import InfoSphereTooltip from '@/views/components/tooltip/InfoSphereTooltip.vue'

export default defineComponent({
  name: 'BookItem',
  components: { InfoSphereTooltip },
  props: {
    item: {
      type: Object as () => Book,
      required: true
    }
  }
})
</script>
