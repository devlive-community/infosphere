<template>
  <InfoSphereSkeleton v-if="loading" :show="loading"/>
  <div v-else-if="items?.length > 0" v-for="item in items" class="hover:bg-gray-100">
    <RouterLink :to="`/book/reader/${identify}/${item.identify}`">
      <div class="flex-1 p-2 cursor-pointer">
        <Label class="cursor-pointer font-normal text-gray-500">{{ item.name }}</Label>
      </div>
    </RouterLink>
    <Separator class="bg-gray-100"/>
  </div>
  <div v-else class="m-auto flex h-full w-full flex-col gap-2">
    <p class="text-muted-foreground m-6">暂无文档。</p>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import BookService from '@/service/book'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Document } from '@/model/document.ts'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'
import { RouterUtils } from '@/lib/router.ts'

export default defineComponent({
  name: 'BookInfo',
  components: {
    InfoSphereSkeleton,
    Separator,
    Label
  },
  data()
  {
    return {
      loading: false,
      identify: null as unknown as string,
      items: [] as Document[]
    }
  },
  created()
  {
    this.initialize()
  },
  methods: {
    initialize()
    {
      const identify = RouterUtils.getParams('identify')
      if (identify) {
        this.identify = identify
        this.loading = true
        BookService.getCatalogByBook(identify)
                   .then(response => {
                     if (response.status && response.data) {
                       this.items = response.data
                     }
                   })
                   .finally(() => this.loading = false)
      }
    }
  }
})
</script>
