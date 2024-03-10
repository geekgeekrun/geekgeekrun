<template>
  <div
    class="flying-company-logo-list-container"
    :style="{
      gridTemplateColumns: `repeat(${colCount}, 1fr)`,
      gridTemplateRows: `repeat(${rowCount}, 1fr)`
    }"
    ref="imageElContainer"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const rowCount = 4
const colCount = 6
const logoQueue: HTMLImageElement[] = []
const imageElContainer = ref<HTMLElement>()
onMounted(async () => {
  const res = (await Promise.all(
    [...Object.values(import.meta.glob('./resources/*.png', { as: 'url' }))].map((it) => it())
  )).map((url) => {
    const img = new Image()
    img.src = url
    img.onanimationiteration = () => {
      const newImg = logoQueue.shift()!
      newImg.classList.add('dot')
      Object.assign(newImg.style,{
        position: 'relative',
        left: (-40 * Math.random()) + 'px',
        bottom: (-40 * Math.random()) + 'px'
      })
      img.replaceWith(newImg)
      img.classList.remove('dot')
      Object.assign(img.style,{
        position: '',
        left: '',
        bottom: ''
      })
      logoQueue.push(img as HTMLImageElement)
    }

    return img
  })
  logoQueue.push(...res)

  for (let i = 0; i < rowCount * colCount; i++) {
    const img = logoQueue.shift()!

    Object.assign(img.style,{
      position: 'relative',
      left: (-40 * Math.random()) + 'px',
      bottom: (-40 * Math.random()) + 'px'
    })

    img.classList.add('dot')
    imageElContainer.value?.append(img)
  }
})
</script>

<style lang="scss" scoped>
.flying-company-logo-list-container {
  height: 600px;
  perspective: 600px;
  display: grid;
  align-items: center;
  justify-items: center;
  justify-content: center;
  gap: 30px;
}
</style>

<style lang="scss">
@keyframes fly-in {
  0% {
    transform: translateZ(-5000px);
    opacity: 0;
  }
  70% {
    opacity: 1;
  }
  90% {
    opacity: 0.5;
  }
  100% {
    transform: translateZ(0);
    opacity: 0;
  }
}
.flying-company-logo-list-container {
  .dot {
    display: block;
    --dot-run-duration: 3s;
    animation: fly-in var(--dot-run-duration) linear infinite;
    transform-origin: center;
    mix-blend-mode: darken;
    width: 200px;
  }
  .dot:nth-child(2n) {
    animation-delay: calc(0 * var(--dot-run-duration));
  }
  .dot:nth-child(2n + 1) {
    animation-delay: calc(-0.1 * var(--dot-run-duration));
  }
  .dot:nth-child(3n + 1) {
    animation-delay: calc(-0.2 * var(--dot-run-duration));
  }
  .dot:nth-child(5n + 1) {
    animation-delay: calc(-0.6 * var(--dot-run-duration));
  }
  .dot:nth-child(7n + 1) {
    animation-delay: calc(-0.8 * var(--dot-run-duration));
  }
  .dot:nth-child(11n + 1) {
    animation-delay: calc(-0.5 * var(--dot-run-duration));
  }
  .dot:nth-child(13n + 1) {
    animation-delay: calc(0 * var(--dot-run-duration));
  }
  .dot:nth-child(17n + 1) {
    animation-delay: calc(-0.1 * var(--dot-run-duration));
  }
}
</style>
