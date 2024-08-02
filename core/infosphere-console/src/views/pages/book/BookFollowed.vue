<template>
  <div class="w-full">
    <InfoSphereSkeleton v-if="loading" :show="loading"/>
    <UserPageable :items="items" :pagination="pagination" @changePage="changePage" @change="initialize"/>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Pagination } from '@/model/response.ts'
import { RouterUtils } from '@/lib/router.ts'
import BookService from '@/service/book.ts'
import { User } from '@/model/user.ts'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'
import UserPageable from '@/views/components/pageable/UserPageable.vue'

export default defineComponent({
  name: 'BookFollowed',
  components: { UserPageable, InfoSphereSkeleton },
  data()
  {
    return {
      loading: false,
      items: [] as User[],
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
        BookService.getFans(this.identify, this.pagination)
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
