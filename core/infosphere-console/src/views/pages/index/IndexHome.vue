<template>
  <div class="flex-col md:flex">
    <div class="flex flex-col space-y-8 space-x-12 mt-3">
      <div class="w-full max-w-7xl mx-auto">
        <div class="space-y-2">
          <Label class="text-xl">最新发布</Label>
          <Separator/>
          <div class="flex space-x-3">
            <div v-for="item in items" class="w-28 h-44 flex flex-col items-center space-y-1">
              <RouterLink :to="`/book/info/${item.identify}`">
                <InfoSphereTooltip position="top">
                  <template #title>
                    <div class="w-full h-32">
                      <AspectRatio class="w-full h-full">
                        <img :src="item.cover ? item.cover : '/images/default-cover.png'" :alt="item.name" class="rounded-md w-full h-full border-2"/>
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
      BookService.getLatest(12)
                 .then(response => this.items = response.data)
    }
  }
})
</script>