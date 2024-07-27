<template>
  <InfoSphereSkeleton v-if="loading" :show="loading"/>
  <div v-else class="space-y-3">
    <BookListWithCoverPageable :items="items" :pagination="pagination" @changePage="changePage"/>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'
import BookListWithCoverPageable from '@/views/components/pageable/BookListWithCoverPageable.vue'
import { Book } from '@/model/book.ts'
import { Pagination } from '@/model/response.ts'
import BookService from '@/service/book.ts'

export default defineComponent({
  name: 'FollowBookHome',
  components: { BookListWithCoverPageable, InfoSphereSkeleton },
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
        BookService.getByUsernameAndFollowed(username as string, this.pagination)
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
