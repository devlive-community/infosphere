<template>
  <InfoSphereSkeleton v-if="loading" :show="loading"/>
  <div v-else class="space-y-3">
    <BookPageable :items="items" :pagination="pagination" @changePage="changePage"/>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import BookService from '@/service/book.ts'
import { Book } from '@/model/book.ts'
import { Pagination } from '@/model/response.ts'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'
import BookPageable from '@/views/components/pageable/BookPageable.vue'

export default defineComponent({
  name: 'UserHome',
  components: { BookPageable, InfoSphereSkeleton },
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
    this.pagination = { page: 1, size: 10 }
    this.initialize()
  },
  methods: {
    initialize()
    {
      const username = this.$route.params.username
      if (username) {
        this.loading = true
        BookService.getByUsername(username as string, this.pagination)
                   .then(response => {
                     this.items = response.data.content
                     this.pagination = response.data.page
                   })
                   .finally(() => this.loading = false)
      }
    },
    changePage(value: Pagination)
    {
      this.pagination = value
      this.initialize()
    }
  }
})
</script>
