<template>
  <div v-if="show" class="flex items-center space-x-4">
    <Skeleton class="h-12 w-12 rounded-full"/>
    <div class="space-y-2 flex-1">
      <Skeleton class="h-4 w-full"/>
      <Skeleton class="h-4 w-full"/>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Skeleton } from '@/components/ui/skeleton'

export default defineComponent({
  name: 'InfoSphereSkeleton',
  components: { Skeleton },
  props: {
    show: {
      type: Boolean,
      default: false
    }
  }
})
</script>