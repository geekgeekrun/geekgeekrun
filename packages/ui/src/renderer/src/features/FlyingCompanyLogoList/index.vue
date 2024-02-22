<template>
  <div
    class="container"
    :style="{
      gridTemplateColumns: `repeat(${colCount}, 1fr)`,
      gridTemplateRows: `repeat(${rowCount}, 1fr)`
    }"
  >
    <img
      v-for="n in rowCount * colCount"
      :key="n"
      class="dot"
      :src="currentIndexToSrcMap[n - 1]"
      @animationiteration="
        (ev) => {
          handleAnimationiteration(ev, n - 1)
        }
      "
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { logoQueueInjectKey } from './types'

const logoQueue = ref<string[]>([])

const rowCount = 4
const colCount = 6
const currentIndexToSrcMap: string[] = ref([])

Promise.all(
  [...Object.values(import.meta.glob('./resources/*.png', { as: 'url' }))].map((it) => it())
).then((res) => {
  logoQueue.value = logoQueue.value.concat(res)
  currentIndexToSrcMap.value = logoQueue.value.splice(0, rowCount * colCount)
})

const handleAnimationiteration = (ev, indexInSrcMap) => {
  logoQueue.value.push(currentIndexToSrcMap.value[indexInSrcMap])
  currentIndexToSrcMap.value[indexInSrcMap] = logoQueue.value.shift()
}
</script>

<style lang="scss" scoped>
@keyframes fly-in {
  0% {
    transform: translateZ(-2500px);
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  75% {
    opacity: 0.5;
  }
  100% {
    transform: translateZ(0);
    opacity: 0;
  }
}

.container {
  height: 600px;
  perspective: 1200px;
  display: grid;
  align-items: center;
  justify-items: center;
  justify-content: center;
  gap: 30px;
}

.dot {
  display: block;
  --dot-run-duration: 1s;
  animation: fly-in var(--dot-run-duration) linear infinite;
  transform-origin: center;
  mix-blend-mode: darken;
  width: 200px;
}
.dot:nth-child(2n) {
  animation-delay: calc(-1 * var(--dot-run-duration));
}
.dot:nth-child(2n + 1) {
  animation-delay: calc(-0.1 * var(--dot-run-duration));
}
.dot:nth-child(3n + 1) {
  animation-delay: calc(-0.2 * var(--dot-run-duration));
}
.dot:nth-child(5n + 1) {
  animation-delay: calc(-0.1 * var(--dot-run-duration));
}
.dot:nth-child(7n + 1) {
  animation-delay: calc(-0.4 * var(--dot-run-duration));
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
</style>
