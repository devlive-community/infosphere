<template>
  <component :is="currentComponent"></component>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue'
import { useRoute } from 'vue-router'
import BookContainer from '@/views/layouts/book/BookContainer.vue'
import InfoContainer from '@/views/layouts/book/InfoContainer.vue'
import LayoutContainer from '@/views/layouts/basic/LayoutContainer.vue'
import WriterContainer from '@/views/layouts/book/WriterContainer.vue'

export default defineComponent({
  name: 'DynamicContainer',
  components: {
    BookContainer,
    InfoContainer
  },
  setup()
  {
    const route = useRoute()

    const currentComponent = computed(() => {
      if (route.path.startsWith('/book/info')) {
        return LayoutContainer
      }
      if (route.path.startsWith('/book/setting')) {
        return InfoContainer
      }
      if (route.path.startsWith('/book/writer') || route.path.startsWith('/book/reader')) {
        return WriterContainer
      }
      else {
        return BookContainer
      }
    })

    return {
      currentComponent
    }
  }
})
</script>