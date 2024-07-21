<template>
  <div class="flex-col md:flex">
    <div class="flex flex-col space-y-8 space-x-12 mt-3 mb-3">
      <div class="w-full max-w-7xl mx-auto space-y-5">
        <div class="space-y-3">
          <div class="flex justify-between">
            <Label class="text-xl">最新发布</Label>
            <RouterLink to="/explore">
              <Button variant="ghost" class="font-normal text-gray-500 text-xs justify-center">查看更多</Button>
            </RouterLink>
          </div>
          <Separator/>
          <InfoSphereSkeleton v-if="loading" :show="loading"/>
          <div v-else class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-8 gap-4">
            <div v-for="item in newestItems" :key="item.identify" class="flex flex-col items-center">
              <BookItem :item="item"/>
            </div>
          </div>
        </div>
        <div class="space-y-3">
          <div class="flex justify-between">
            <Label class="text-xl">热门书籍</Label>
            <RouterLink to="/explore">
              <Button variant="ghost" class="font-normal text-gray-500 text-xs justify-center">查看更多</Button>
            </RouterLink>
          </div>
          <Separator/>
          <InfoSphereSkeleton v-if="loading" :show="loading"/>
          <div v-else class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-8 gap-4">
            <div v-for="item in hosttestItems" :key="item.identify" class="flex flex-col items-center">
              <BookItem :item="item"/>
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
import { Pagination } from '@/model/response.ts'
import BookItem from '@/views/components/item/BookItem.vue'
import { HttpUtils } from '@/lib/http.ts'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'

export default defineComponent({
  name: 'IndexHome',
  components: { InfoSphereSkeleton, BookItem, InfoSphereTooltip, Separator, Label },
  data()
  {
    return {
      loading: false,
      newestItems: [] as Book[],
      hosttestItems: [] as Book[],
      pagination: null as unknown as Pagination
    }
  },
  created()
  {
    this.pagination = { page: 1, size: 16 }
    this.initialize()
  },
  methods: {
    initialize()
    {
      this.loading = true
      const axios = new HttpUtils().getAxios()
      axios.all([BookService.getNewest(this.pagination), BookService.getHottest(this.pagination)])
           .then(axios.spread((newest, hottest) => {
             this.newestItems = newest.data.content
             this.hosttestItems = hottest.data.content
           }))
           .finally(() => this.loading = false)
    }
  }
})
</script>