<template>
  <div class="flex-col md:flex">
    <div class="flex flex-col space-y-8 space-x-12 mt-3">
      <div class="w-full max-w-7xl mx-auto">
        <div class="space-y-3">
          <div class="flex justify-between">
            <Label class="text-xl">最新发布</Label>
            <RouterLink to="/explore">
              <Button variant="ghost" class="font-normal text-gray-500 text-xs justify-center">查看更多</Button>
            </RouterLink>
          </div>
          <Separator/>
          <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
            <div v-for="item in items" :key="item.identify" class="flex flex-col items-center">
              <RouterLink :to="`/book/info/${item.identify}`">
                <InfoSphereTooltip position="top">
                  <template #title>
                    <div class="w-full h-40">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import InfoSphereTooltip from '@/views/components/tooltip/InfoSphereTooltip.vue'
import BookService from '@/service/book.ts'
import { Book } from '@/model/book.ts'

export default defineComponent({
  name: 'IndexHome',
  components: { InfoSphereTooltip, Separator, Label },
  data()
  {
    return {
      items: [] as Book[]
    }
  },
  created()
  {
    this.initialize()
  },
  methods: {
    initialize()
    {
      BookService.getLatest(10)
                 .then(response => this.items = response.data)
    }
  }
})
</script>