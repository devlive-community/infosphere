<template>
  <Card :class="cn('rounded-sm', computedShadow)">
    <CardHeader v-if="$slots.title || title" class="p-0">
      <CardTitle>
        <span v-if="title">{{ title }}</span>
        <slot v-else name="title"/>
      </CardTitle>
    </CardHeader>
    <CardContent class="p-0">
      <slot/>
    </CardContent>
    <CardFooter class="border-t p-4" v-if="$slots.footer">
      <slot name="footer"/>
    </CardFooter>
  </Card>
</template>

<script lang="ts">
import { defineComponent, ref, watchEffect } from 'vue'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils.ts'
import { Shadow } from '@/views/components/card/Shadow.ts'

export default defineComponent({
  name: 'InfoSphereCard',
  components: {
    CardFooter, Card, CardContent, CardHeader, CardTitle
  },
  props: {
    title: {
      type: String
    },
    shadow: {
      type: String,
      default: 'never'
    }
  },
  setup(props)
  {
    const computedShadow = ref<string>('never')

    watchEffect(() => {
      computedShadow.value = Shadow[props.shadow as keyof typeof Shadow]
    })

    return {
      cn,
      computedShadow
    }
  }
})
</script>
