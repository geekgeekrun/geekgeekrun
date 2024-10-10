<template>
  <pre><template v-for="diff in diffResultList"
    ><del v-if="diff.removed"
      >{{ diff.value }}</del
      ><ins v-else-if="diff.added">{{ diff.value }}</ins
      ><span v-else-if="diff.chunkHeader" class="chunk-header">{{ diff.value }}</span
      ><span v-else>{{ diff.value }}</span
      ></template></pre>
</template>

<script lang="ts" setup>
import { PropType, computed } from 'vue'
import { diffWords } from 'diff'
const props = defineProps({
  a: {
    type: String,
    default: ''
  },
  b: {
    type: String,
    default: ''
  }
})
const diffResultList = computed(() => {
  const diffs = diffWords(props.a, props.b)
  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i].added && diffs[i + 1] && diffs[i + 1].removed) {
      ;[diffs[i], diffs[i + 1]] = [diffs[i + 1], diffs[i]]
    }
  }
  return diffs
})
</script>

<style lang="scss" scoped>
pre {
  overflow: auto;
}
del {
  text-decoration: line-through;
  color: #b30000;
  background: #fadad7;
}

ins {
  background: #eaf2c2;
  color: #406619;
  text-decoration: none;
}

.chunk-header {
  color: #8a008b;
  text-decoration: none;
}
</style>
