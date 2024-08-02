<template>
  <component :is="currentComponent"></component>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue'
import { useRoute } from 'vue-router'
import BookContainer from '@/views/layouts/book/BookContainer.vue'
import SettingContainer from '@/views/layouts/book/SettingContainer.vue'
import WriterContainer from '@/views/layouts/book/WriterContainer.vue'
import InfoContainer from '@/views/layouts/book/InfoContainer.vue'

export default defineComponent({
  name: 'DynamicContainer',
  setup()
  {
    const route = useRoute()

    const currentComponent = computed(() => {
      if (route.path.startsWith('/book/info') || route.path.startsWith('/book/access')) {
        return InfoContainer
      }
      if (route.path.startsWith('/book/setting')) {
        return SettingContainer
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