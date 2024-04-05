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
import { random } from 'lodash-es'

const rowCount = 4
const colCount = 6
const logoQueue: HTMLImageElement[] = []
const imageElContainer = ref<HTMLElement>()
onMounted(async () => {
  const res = (
    await Promise.all(
      [...Object.values(import.meta.glob('./resources/*.jpg', { as: 'url' }))].map((it) => it())
    )
  ).map((url) => {
    const img = new Image()
    img.src = url
    img.onanimationiteration = () => {
      const newImg = logoQueue.shift()!
      newImg.classList.add('dot')
      Object.assign(newImg.style, {
        position: 'relative',
        left: (Math.random() > 0.5 ? -1 : 1) * (100 * Math.random()) + 'px',
        bottom: (Math.random() > 0.5 ? -1 : 1) * (100 * Math.random()) + 'px',
        transform: `scale(${random(0.2, 1)}) translateZ(-5000px)`
      })
      img.replaceWith(newImg)
      img.classList.remove('dot')
      Object.assign(img.style, {
        position: '',
        left: '',
        bottom: '',
        transform: ``
      })
      logoQueue.push(img as HTMLImageElement)
    }

    return img
  })
  logoQueue.push(...res)

  for (let i = 0; i < rowCount * colCount; i++) {
    const img = logoQueue.shift()!

    Object.assign(img.style, {
      position: 'relative',
      left: -40 * Math.random() + 'px',
      bottom: -40 * Math.random() + 'px',
      transform: `translateZ(${-5000}px)`
    })

    img.classList.add('dot')
    imageElContainer.value?.append(img)
  }
})
</script>

<style lang="scss" scoped>
.flying-company-logo-list-container {
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
    opacity: 0;
  }
  30% {
    opacity: 0;
  }
  60% {
    opacity: 0.9;
  }
  90% {
    opacity: 0;
  }
  100% {
    transform: translateZ(0);
    opacity: 0;
  }
}
.flying-company-logo-list-container {
  .dot {
    display: block;
    --dot-run-duration: 2.5s;
    animation: fly-in var(--dot-run-duration) ease-in-out infinite;
    transform-origin: center;
    mix-blend-mode: darken;
    width: 100px;
  }
  .dot:nth-child(2n) {
    animation-delay: calc(-0.35 * var(--dot-run-duration));
  }
  .dot:nth-child(2n + 1) {
    animation-delay: calc(-0.15 * var(--dot-run-duration));
  }
  .dot:nth-child(3n + 1) {
    animation-delay: calc(-0.22 * var(--dot-run-duration));
  }
  .dot:nth-child(5n + 1) {
    animation-delay: calc(-0.05 * var(--dot-run-duration));
  }
  .dot:nth-child(7n + 1) {
    animation-delay: calc(-0.1 * var(--dot-run-duration));
  }
}
</style>
