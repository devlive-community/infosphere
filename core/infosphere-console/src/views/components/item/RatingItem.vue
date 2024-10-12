<template>
  <article class="py-6 text-base bg-white border-b-2">
    <footer class="flex justify-between items-center mb-2">
      <div class="flex items-center">
        <p class="inline-flex items-center mr-3 text-sm text-gray-900 font-semibold">
          <img class="mr-2 w-10 h-10 rounded-full" :src="item?.user?.avatar as string" :alt="item?.user?.aliasName">
          <span>{{ item?.user?.aliasName ? item?.user?.aliasName : item?.user?.username }}</span>
        </p>
        <div class="flex text-sm text-gray-600 dark:text-gray-400">
          <span>评分：</span>
          <VueStarRating class="-mt-1" :rating="item?.rating as number" :read-only="true" :increment="0.5" :star-size="20"/>
        </div>
      </div>
    </footer>
    <p class="text-gray-600">{{ item?.review }}</p>
    <div class="flex items-center mt-4 space-x-1.5 text-sm text-gray-500">
      <ClockIcon class="w-4 h-4"/>
      <span>{{ item?.createTime }}</span>
    </div>
  </article>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Rating } from '@/model/rating.ts'
import { ClockIcon } from 'lucide-vue-next'
import VueStarRating from 'vue-star-rating'

export default defineComponent({
  name: 'RatingItem',
  components: { ClockIcon, VueStarRating },
  props: {
    item: {
      type: Object as () => Rating,
      required: true
    }
  }
})
</script>
