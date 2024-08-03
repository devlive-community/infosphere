<template>
  <div class="w-full">
    <InfoSphereSkeleton v-if="loading" :show="loading"/>
    <AvatarPageable v-else :pagination="pagination" :items="items" @changePage="changePage"/>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'
import AvatarPageable from '@/views/components/pageable/AvatarPageable.vue'
import { Access } from '@/model/access.ts'
import { Pagination } from '@/model/response.ts'
import BookService from '@/service/book.ts'
import { RouterUtils } from '@/lib/router.ts'

export default defineComponent({
  name: 'BookAccess',
  components: { AvatarPageable, InfoSphereSkeleton },
  data()
  {
    return {
      loading: false,
      items: [] as Access[],
      identify: null as unknown as string,
      pagination: null as unknown as Pagination
    }
  },
  created()
  {
    this.identify = RouterUtils.getParams('identify')
    this.pagination = { page: 1, size: 203 }
    this.initialize()
  },
  methods: {
    initialize()
    {
      if (this.identify) {
        this.loading = true
        BookService.getAllAccessByBook(this.identify, this.pagination)
                   .then(response => {
                     if (response.status && response.data) {
                       this.items = response.data.content
                       this.pagination = response.data.page
                     }
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
