<template>
  <div v-if="result.blobURL || pic" :class="cn(type === 'cover' && 'w-44 h-64',
                                               type === 'avatar' && 'w-32 h-32')">
    <AspectRatio class="w-full h-64">
      <img class="border-2 rounded-md w-full h-full" :src="result.blobURL ? result.blobURL : pic" alt="图片"/>
    </AspectRatio>
  </div>

  <div>
    <Button class="p-0 text-black bg-gray-50 hover:bg-gray-100 shadow-background">
      <Input ref="uploadInput" class="text-black" type="file" accept="image/jpg, image/jpeg, image/png, image/gif" @change="selectFile"/>
    </Button>
  </div>

  <InfoSphereDialog v-if="isShowModal" :is-visible="isShowModal" title="裁剪" @close="isShowModal = $event">
    <div class="p-0">
      <VuePictureCropper style="max-height: 400px" :boxStyle="{ width: '100%', height: '100%', backgroundColor: '#f8f8f8', margin: 'auto' }"
                         :options="{ viewMode: 1, dragMode: 'crop', }" :img="pic" @ready="ready"/>
    </div>
    <template #footer>
      <div class="space-x-2">
        <Button size="sm" @click="isShowModal = false">
          取消
        </Button>
        <Button variant="destructive" size="sm" @click="clear">
          清除
        </Button>
        <Button class="btn" size="sm" variant="destructive" @click="reset">
          重置
        </Button>
        <Button class="btn primary" size="sm" @click="getResult">
          裁剪
        </Button>
      </div>
    </template>
  </InfoSphereDialog>
</template>

<script lang="ts">
import { defineComponent, reactive, ref } from 'vue'
import VuePictureCropper, { cropper } from 'vue-picture-cropper'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import InfoSphereDialog from '@/views/components/dialog/InfoSphereDialog.vue'
import { cn } from '@/lib/utils.ts'

export default defineComponent({
  components: {
    InfoSphereDialog,
    Input, Button,
    VuePictureCropper
  },
  props: {
    pic: {
      type: String
    },
    type: {
      type: String,
      default: 'cover'
    }
  },
  setup(props, { emit })
  {
    const isShowModal = ref<boolean>(false)
    const uploadInput = ref<HTMLInputElement | null>(null)
    const pic = ref<string>(props.pic as string)
    const result = reactive({
      blobURL: ''
    })

    function selectFile(e: Event)
    {
      pic.value = ''
      result.blobURL = ''

      const { files } = e.target as HTMLInputElement
      if (!files || !files.length) {
        return
      }

      const file = files[0]
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        pic.value = String(reader.result)
        isShowModal.value = true
        if (!uploadInput.value) {
          return
        }
        uploadInput.value.value = ''
      }
    }

    async function getResult()
    {
      if (!cropper) {
        return
      }
      const blob: Blob | null = await cropper.getBlob()
      if (!blob) {
        return
      }
      result.blobURL = URL.createObjectURL(blob)
      isShowModal.value = false
      const file = await cropper.getFile()
      emit('update:value', file)
    }

    function clear()
    {
      if (!cropper) {
        return
      }
      cropper.clear()
    }

    function reset()
    {
      if (!cropper) {
        return
      }
      cropper.reset()
    }

    function ready()
    {
      console.log('Cropper is ready.')
    }

    return {
      uploadInput,
      pic,
      result,
      isShowModal,
      selectFile,
      getResult,
      clear,
      reset,
      ready
    }
  },
  methods: { cn }
})
</script>
