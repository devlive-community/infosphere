<template>
  <div>
    <TooltipProvider :delayDuration="0">
      <Tooltip>
        <TooltipTrigger>
          <slot name="title"/>
        </TooltipTrigger>
        <TooltipContent :side="position">
          <slot name="content"/>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export default defineComponent({
  name: 'InfoSphereTooltip',
  components: { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger },
  props: {
    position: {
      type: String as PropType<'top' | 'right' | 'bottom' | 'left'>,
      default: 'bottom'
    }
  }
})
</script>
