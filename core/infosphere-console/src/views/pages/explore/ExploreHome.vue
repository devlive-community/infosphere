<template>
  <div class="flex-col md:flex">
    <div class="flex flex-col space-y-8 space-x-12 mt-3">
      <div class="w-full max-w-7xl mx-auto">
        <div class="space-y-3">
          <div class="flex justify-between">
            <Label class="text-xl">书籍列表 ({{ items?.length }})</Label>
          </div>
          <Separator/>
          <div class="space-x-3">
            <InfoSphereSkeleton v-if="loading" :show="loading"/>
            <BookCoverPageable v-else :items="items" :pagination="pagination" @changePage="changePage"/>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import BookPageable from '@/views/components/pageable/BookPageable.vue'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'
import InfoSphereTooltip from '@/views/components/tooltip/InfoSphereTooltip.vue'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Book } from '@/model/book.ts'
import BookService from '@/service/book.ts'
import { Pagination } from '@/model/response.ts'
import BookCoverPageable from '@/views/components/pageable/BookCoverPageable.vue'

export default defineComponent({
  name: 'ExploreHome',
  components: { BookCoverPageable, Separator, Label, InfoSphereTooltip, InfoSphereSkeleton, BookPageable },
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
    this.pagination = { page: 1, size: 100, visibility: true, excludeUser: true }
    this.initialize()
  },
  methods: {
    initialize()
    {
      this.loading = true
      BookService.getAllPublic(this.pagination)
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
