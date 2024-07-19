<template>
  <footer class="font-sans bg-black p-10 space-y-3">
    <div class="text-center text-white">Copyright © 2023 - {{ new Date().getFullYear() }} Devlive Community All Rights Reserved</div>
    <div class="text-center text-white">
      Powered by <a href="https://github.com/devlive-community/incubator-infosphere" target="_blank" class="hover:border-b hover:text-blue-300">Infosphere</a>
    </div>
    <div class="text-center text-white space-x-2">
      <span>Versions</span>
      <a :href="`https://github.com/devlive-community/incubator-infosphere/tree/${version}`" target="_blank" class="hover:border-b">
        <span class="text-red-500">{{ version }}</span>
      </a>
    </div>
  </footer>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { PackageUtils } from '@/lib/package.ts'

export default defineComponent({
  name: 'LayoutFooter',
  setup()
  {
    const version = PackageUtils.get('version')

    return {
      version
    }
  }
})
</script>
