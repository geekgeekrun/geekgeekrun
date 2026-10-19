import { computed, ref } from 'vue'

export type ColorScheme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'geekgeekrun-color-scheme'
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
const scheme = ref<ColorScheme>('system')
const systemDark = ref(mediaQuery.matches)
let initialized = false

function getStoredScheme(): ColorScheme | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : null
}

function resolveDark(value: ColorScheme) {
  return value === 'dark' || (value === 'system' && systemDark.value)
}

function applyScheme() {
  const root = document.documentElement
  root.classList.toggle('dark', resolveDark(scheme.value))
  root.style.colorScheme = resolveDark(scheme.value) ? 'dark' : 'light'
}

export function initColorScheme() {
  if (initialized) return
  initialized = true
  scheme.value = getStoredScheme() ?? 'system'
  applyScheme()
  mediaQuery.addEventListener('change', (event) => {
    systemDark.value = event.matches
    if (scheme.value === 'system') {
      applyScheme()
    }
  })
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    scheme.value =
      event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system'
    applyScheme()
  })
}

export function useColorScheme() {
  initColorScheme()

  const isDark = computed(() => resolveDark(scheme.value))

  function setScheme(value: ColorScheme) {
    scheme.value = value
    localStorage.setItem(STORAGE_KEY, value)
    applyScheme()
  }

  return { scheme, isDark, setScheme }
}
