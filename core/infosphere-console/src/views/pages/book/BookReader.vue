<template>
  <InfoSphereLoading v-if="loading" :show="loading"/>
  <Card v-else-if="info" class="w-full rounded-sm border-0 shadow-background">
    <CardHeader class="p-0 space-y-1.5">
      <CardTitle class="space-x-4 flex items-center">
        <Menubar class="border-0 shadow-none w-full rounded-none pl-5 pt-7 pb-7 border-b flex justify-between">
          <div class="flex items-center space-x-4">
            <RouterLink :to="`/book/info/${identify}`">
              <span>{{ info.name }}</span>
            </RouterLink>
          </div>
          <div class="ml-auto"></div>
        </Menubar>
      </CardTitle>
    </CardHeader>
    <CardContent class="p-0 space-y-6">
      <div class="flex flex-col lg:flex-row">
        <div class="w-[200px] overflow-x-auto overflow-y-auto h-screen border-t-0" :style="{ height: 'calc(100vh - 57px)' }">
          <BookSidebar :item="item" @change="change"/>
        </div>
        <div class="flex-1">
          <InfoSphereLoading v-if="documentLoading" :show="documentLoading"/>
          <div v-else>
            <Card class="w-full rounded-sm border-0 shadow-background">
              <CardHeader class="p-4 border-b items-center">
                <CardTitle>{{ item?.name }}</CardTitle>
              </CardHeader>
              <CardContent class="p-0">
                <MarkdownEditor v-if="item?.editor === 'Markdown'" :content="item.content ? item.content : ''" :preview="true" :style="{ height: 'calc(100vh - 106px)' }"/>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { BookOpenIcon, Loader2Icon, SaveIcon } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import MarkdownEditor from '@/views/components/editor/MarkdownEditor.vue'
import { Menubar, MenubarShortcut } from '@/components/ui/menubar'
import { Button } from '@/components/ui/button'
import BookCatalog from '@/views/pages/book/components/BookCatalog.vue'
import { useRouter } from 'vue-router'
import { Book } from '@/model/book.ts'
import BookService from '@/service/book.ts'
import InfoSphereLoading from '@/views/components/loading/InfoSphereLoading.vue'
import BookSidebar from '@/views/pages/book/components/BookSidebar.vue'
import { Document } from '@/model/document.ts'
import DocumentService from '@/service/document.ts'
import router from '@/router'

export default defineComponent({
  name: 'BookReader',
  components: {
    BookSidebar,
    InfoSphereLoading,
    BookCatalog,
    CardHeader,
    CardTitle,
    MenubarShortcut,
    Button,
    Loader2Icon,
    Menubar,
    MarkdownEditor,
    Card,
    SaveIcon,
    CardContent,
    BookOpenIcon
  },
  data()
  {
    return {
      loading: false,
      documentLoading: false,
      info: null as unknown as Book,
      identify: null as unknown as string,
      item: null as unknown as Document
    }
  },
  created()
  {
    const router = useRouter()
    const params = router.currentRoute.value.params
    this.identify = params['bookIdentify'] as string
    this.initialize()
  },
  methods: {
    initialize()
    {
      this.loading = true
      BookService.getByIdentify(this.identify)
                 .then(response => this.info = response.data)
                 .finally(() => this.loading = false)
    },
    change(value: string)
    {
      router.push(`/book/reader/${ this.identify }/${ value }`)
      this.documentLoading = true
      DocumentService.getByIdentify(value)
                     .then(response => this.item = response.data)
                     .finally(() => this.documentLoading = false)
    }
  }
})
</script>
