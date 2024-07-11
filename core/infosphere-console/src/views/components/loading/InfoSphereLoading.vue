<template>
  <Loader2Icon v-if="show" class="w-full justify-center animate-spin mt-10"/>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Loader2Icon } from 'lucide-vue-next'

export default defineComponent({
  name: 'InfoSphereLoading',
  components: { Loader2Icon },
  props: {
    show: {
      type: Boolean,
      default: () => false
    }
  }
})
</script>
