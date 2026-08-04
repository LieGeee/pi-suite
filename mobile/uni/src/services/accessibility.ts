import { computed, reactive } from 'vue'

export type TextScale = 'standard' | 'large' | 'extra-large'

export interface AccessibilitySettings {
  textScale: TextScale
  simpleMode: boolean
}

const STORAGE_TEXT_SCALE = 'pi-mobile.accessibility.textScale'
const STORAGE_SIMPLE_MODE = 'pi-mobile.accessibility.simpleMode'

export const accessibility = reactive<AccessibilitySettings>({
  textScale: 'large',
  simpleMode: true,
})

export const textScaleClass = computed(() => `text-scale-${accessibility.textScale}`)

function isTextScale(value: unknown): value is TextScale {
  return value === 'standard' || value === 'large' || value === 'extra-large'
}

export function loadAccessibilitySettings() {
  try {
    const storedScale = uni.getStorageSync(STORAGE_TEXT_SCALE)
    const storedSimpleMode = uni.getStorageSync(STORAGE_SIMPLE_MODE)
    if (isTextScale(storedScale)) accessibility.textScale = storedScale
    if (typeof storedSimpleMode === 'boolean') accessibility.simpleMode = storedSimpleMode
  } catch {
    // Keep accessible defaults when storage is unavailable.
  }
}

export function setTextScale(scale: TextScale) {
  accessibility.textScale = scale
  try {
    uni.setStorageSync(STORAGE_TEXT_SCALE, scale)
  } catch {
    // The current page still updates even when persistence fails.
  }
}

export function setSimpleMode(enabled: boolean) {
  accessibility.simpleMode = enabled
  try {
    uni.setStorageSync(STORAGE_SIMPLE_MODE, enabled)
  } catch {
    // The current page still updates even when persistence fails.
  }
}
