<template>
  <div class="w-full">
    <div>
      <h3 class="text-lg font-medium">书籍列表</h3>
    </div>
    <Separator class="my-4"/>
    <InfoSphereSkeleton v-if="loading" :show="loading"/>
    <BookPageable v-else :items="items" :pagination="pagination" @changePage="changePage"/>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import BookService from '@/service/book.ts'
import { Separator } from '@/components/ui/separator'
import { Book } from '@/model/book.ts'
import BookPageable from '@/views/components/pageable/BookPageable.vue'
import { Pagination } from '@/model/response.ts'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'

export default defineComponent({
  name: 'BookPublic',
  components: {
    InfoSphereSkeleton,
    BookPageable,
    Separator
  },
  data()
  {
    return {
      loading: false,
      items: [] as Array<Book>,
      pagination: null as unknown as Pagination
    }
  },
  created()
  {
    this.pagination = { page: 1, size: 10, visibility: true }
    this.initialize()
  },
  methods: {
    initialize()
    {
      this.loading = true
      BookService.getAll(this.pagination)
                 .then(response => {
                   this.items = response.data.content
                   this.pagination = response.data.page
                 })
                 .finally(() => this.loading = false)
    },
    changePage(value: Pagination)
    {
      this.pagination = value
      this.pagination.visibility = true
      this.initialize()
    }
  }
})
</script>
