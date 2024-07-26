<template>
  <InfoSphereLoading v-if="loading" :show="loading"/>
  <BookWithFullItem v-else-if="info" :info="info"/>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'
import { Book } from '@/model/book.ts'
import { useRouter } from 'vue-router'
import BookService from '@/service/book.ts'
import BookWithFullItem from '@/views/components/item/BookWithFullItem.vue'

export default defineComponent({
  name: 'BookSummary',
  components: {
    BookWithFullItem,
    InfoSphereLoading
  },
  data()
  {
    return {
      loading: false,
      info: null as unknown as Book
    }
  },
  created()
  {
    this.initialize()
  },
  methods: {
    initialize()
    {
      const router = useRouter()
      const params = router.currentRoute.value.params
      const identify = params['identify'] as string

      this.loading = true
      BookService.getByIdentify(identify)
                 .then(response => {
                   this.info = response.data
                 })
                 .finally(() => this.loading = false)
    }
  }
})
</script>
