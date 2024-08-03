<template>
  <div class="w-full">
    <div>
      <h3 class="text-lg font-medium">书籍列表</h3>
    </div>
    <Separator class="my-4"/>
    <InfoSphereSkeleton v-if="loading" :show="loading"/>
    <BookPageable v-else :items="items" :pagination="pagination" :is-followed="true" @changePage="changePage"/>
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
import { useUserStore } from '@/stores/user.ts'

export default defineComponent({
  name: 'BookFollowed',
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
    this.pagination = { page: 1, size: 10 }
    this.initialize()
  },
  methods: {
    initialize()
    {
      const userStore = useUserStore()
      if (userStore.info) {
        this.loading = true
        BookService.getByUsernameAndFollowed(userStore.info.username as string, this.pagination)
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
