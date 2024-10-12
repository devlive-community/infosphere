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

    // 路径前缀常量
    const PATH_PREFIXES = {
      noSpecified: ['/book/followed'],
      info: ['/book/info', '/book/access', '/book/follow', '/book/comment'],
      setting: ['/book/setting'],
      writer: ['/book/writer', '/book/reader']
    }

    // 计算当前组件
    const currentComponent = computed(() => {
      const path = route.path
      if (PATH_PREFIXES.noSpecified.some(prefix => path.startsWith(prefix))) {
        return BookContainer
      }
      if (PATH_PREFIXES.info.some(prefix => path.startsWith(prefix))) {
        return InfoContainer
      }
      if (PATH_PREFIXES.setting.some(prefix => path.startsWith(prefix))) {
        return SettingContainer
      }
      if (PATH_PREFIXES.writer.some(prefix => path.startsWith(prefix))) {
        return WriterContainer
      }
      return BookContainer
    })

    return {
      currentComponent
    }
  }
})
</script>
