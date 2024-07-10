<template>
  <div class="w-full">
    <div>
      <h3 class="text-lg font-medium">书籍列表</h3>
    </div>
    <Separator class="my-4"/>
    <InfoSphereSkeleton v-if="loading" :show="loading"/>
    <BookPageable v-else :items="items" :pagination="pagination"/>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import BookService from '@/service/book.ts'
import { Page } from '@/model/page.ts'
import { Separator } from '@/components/ui/separator'
import { Book } from '@/model/book.ts'
import BookPageable from '@/views/components/pageable/BookPageable.vue'
import { Pagination } from '@/model/response.ts'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'

export default defineComponent({
  name: 'BookHome',
  components: {
    InfoSphereSkeleton,
    BookPageable,
    Separator
  },
  data()
  {
    return {
      loading: false,
      configure: null as unknown as Page,
      items: [] as Array<Book>,
      pagination: null as unknown as Pagination
    }
  },
  created()
  {
    this.initialize()
  },
  methods: {
    initialize()
    {
      this.loading = true
      this.configure = { start: 0, end: 10 }
      BookService.getAll(this.configure)
                 .then(response => {
                   this.items = response.data.content
                   this.pagination = response.data.page
                 })
                 .finally(() => this.loading = false)
    }
  }
})
</script>
