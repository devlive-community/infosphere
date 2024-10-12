<template>
  <div class="w-full">
    <div v-if="formState" class="w-full mb-2">
      <div class="flex items-center space-x-6 py-3">
        <Label class="text-gray-400">我的评分:</Label>
        <VueStarRating class="-mt-2" v-model:rating="formState.rating" :increment="0.5" :star-size="20"/>
      </div>
      <div class="space-y-1.5">
        <Textarea class="resize-none h-24" placeholder="文明评论，理性发言" v-model="formState.review" :default-value="formState.review"></Textarea>
        <div class="flex justify-end">
          <Button class="bg-green-500 hover:bg-green-600" :disabled="!(formState.rating && formState.review) || submitted" @click="submitRating">
            <Loader2Icon v-if="submitted" class="w-full justify-center animate-spin mr-3" :size="15"/>
            发布评论
          </Button>
        </div>
      </div>
    </div>
    <InfoSphereSkeleton v-if="loading" :show="loading"/>
    <RatingPageable v-else :pagination="pagination" :items="items" @changePage="changePage"/>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import InfoSphereSkeleton from '@/views/components/skeleton/InfoSphereSkeleton.vue'
import { Label } from '@/components/ui/label'
import VueStarRating from 'vue-star-rating'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Rating } from '@/model/rating.ts'
import { RouterUtils } from '@/lib/router.ts'
import { Loader2Icon } from 'lucide-vue-next'
import { toast } from 'vue3-toastify'
import RatingService from '@/service/rating.ts'
import { Pagination } from '@/model/response.ts'
import RatingPageable from '@/views/components/pageable/RatingPageable.vue'

export default defineComponent({
  name: 'BookComment',
  components: { RatingPageable, Loader2Icon, Button, Textarea, Label, InfoSphereSkeleton, VueStarRating },
  data()
  {
    return {
      loading: false,
      submitted: false,
      identify: null as unknown as string,
      items: [] as Rating[],
      formState: null as unknown as Rating,
      pagination: null as unknown as Pagination
    }
  },
  created()
  {
    this.identify = RouterUtils.getParams('identify')
    this.pagination = { page: 1, size: 10 }
    this.initialize()
  },
  methods: {
    initialize()
    {
      if (this.identify) {
        this.formState = {
          rating: 0, review: undefined, book: { identify: this.identify }
        }
        this.loading = true
        RatingService.getByBookIdentify(this.identify)
                     .then(response => {
                       if (response.status) {
                         this.items = response.data.content
                         this.pagination = response.data.page
                       }
                       else {
                         toast(response.message as string, { type: 'error' })
                       }
                     })
                     .finally(() => this.loading = false)
      }
    },
    changePage(value: Pagination)
    {
      this.pagination = value
      this.initialize()
    },
    submitRating()
    {
      this.submitted = true
      RatingService.saveOrUpdate(this.formState)
                   .then(response => {
                     if (response.status) {
                       toast(`发布评论成功！`, { type: 'success' })
                     }
                     else {
                       toast(response.message as string, { type: 'error' })
                     }
                   })
                   .finally(() => this.submitted = false)
    }
  }
})
</script>
