import { ref } from 'vue'

export type SpeechState = 'idle' | 'requesting-permission' | 'recording' | 'processing' | 'unavailable'

export const speechState = ref<SpeechState>('idle')
export const interimText = ref('')
export const finalText = ref('')
export const speechError = ref<string | undefined>()
export const isSupported = ref(false)

const RECORD_AUDIO = 'android.permission.RECORD_AUDIO'
const ERROR_MAP: Record<number, string> = {
  1: '语音服务响应超时',
  2: '语音服务网络异常',
  3: '无法读取麦克风',
  4: '语音服务暂时不可用',
  5: '语音识别已中断',
  6: '没有听到声音',
  7: '没有识别到文字',
  8: '语音识别正在使用中',
  9: '未获得麦克风权限',
  11: '当前设备不支持中文识别',
  12: '语音请求过于频繁',
  13: '设备没有语音识别服务',
}

type AndroidClass = Record<string, any> & { new (...args: any[]): any }

let recognizer: any = null
let recognitionListener: any = null
let currentResolve: ((text: string) => void) | null = null
let currentReject: ((error: Error) => void) | null = null

function importAndroidClass(className: string): AndroidClass {
  return plus.android.importClass(className) as unknown as AndroidClass
}

function invokeAndroid(target: unknown, method: string, ...args: unknown[]): any {
  const invoke = plus.android.invoke as unknown as (
    target: unknown,
    method: string,
    ...args: unknown[]
  ) => any
  return invoke(target, method, ...args)
}

export function initializeSpeech(): boolean {
  try {
    if (typeof plus === 'undefined' || !plus.android) {
      speechState.value = 'unavailable'
      isSupported.value = false
      return false
    }
    const SpeechRecognizer = importAndroidClass('android.speech.SpeechRecognizer')
    isSupported.value = Boolean(SpeechRecognizer.isRecognitionAvailable(plus.android.runtimeMainActivity()))
    speechState.value = isSupported.value ? 'idle' : 'unavailable'
    return isSupported.value
  } catch {
    isSupported.value = false
    speechState.value = 'unavailable'
    return false
  }
}

function requestMicrophonePermission(): Promise<boolean> {
  speechState.value = 'requesting-permission'
  return new Promise((resolve) => {
    plus.android.requestPermissions(
      [RECORD_AUDIO],
      (result: { granted?: string[]; deniedPresent?: string[]; deniedAlways?: string[] }) => {
        resolve(Boolean(result.granted?.includes(RECORD_AUDIO)))
      },
      () => resolve(false)
    )
  })
}

function firstRecognitionResult(bundle: any): string {
  const results = invokeAndroid(bundle, 'get', 'results_recognition')
  if (!results || Number(invokeAndroid(results, 'size')) < 1) return ''
  return String(invokeAndroid(results, 'get', 0) ?? '').trim()
}

function finishWithError(message: string) {
  speechError.value = message
  speechState.value = 'idle'
  currentReject?.(new Error(message))
  currentReject = null
  currentResolve = null
  destroyRecognizer()
}

function destroyRecognizer() {
  if (recognizer) {
    try {
      invokeAndroid(recognizer, 'destroy')
    } catch {
      // Runtime may have already released the recognizer.
    }
  }
  recognizer = null
  recognitionListener = null
}

function listen(language: string): Promise<string> {
  return new Promise((resolve, reject) => {
    currentResolve = resolve
    currentReject = reject
    interimText.value = ''
    finalText.value = ''
    speechError.value = undefined

    try {
      const SpeechRecognizer = importAndroidClass('android.speech.SpeechRecognizer')
      const RecognizerIntent = importAndroidClass('android.speech.RecognizerIntent')
      const Intent = importAndroidClass('android.content.Intent')
      recognizer = SpeechRecognizer.createSpeechRecognizer(plus.android.runtimeMainActivity())

      const intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      invokeAndroid(intent, 'putExtra', RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      invokeAndroid(intent, 'putExtra', RecognizerIntent.EXTRA_LANGUAGE, language)
      invokeAndroid(intent, 'putExtra', RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      invokeAndroid(intent, 'putExtra', RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      invokeAndroid(intent, 'putExtra', RecognizerIntent.EXTRA_MAX_RESULTS, 3)

      recognitionListener = plus.android.implements('android.speech.RecognitionListener', {
        onReadyForSpeech() {
          speechState.value = 'recording'
        },
        onBeginningOfSpeech() {
          speechState.value = 'recording'
        },
        onRmsChanged() {},
        onBufferReceived() {},
        onEndOfSpeech() {
          speechState.value = 'processing'
        },
        onError(errorCode: number) {
          finishWithError(ERROR_MAP[errorCode] ?? `语音识别错误 ${errorCode}`)
        },
        onResults(bundle: any) {
          const text = firstRecognitionResult(bundle)
          if (!text) {
            finishWithError('没有识别到文字')
            return
          }
          finalText.value = text
          speechState.value = 'idle'
          currentResolve?.(text)
          currentResolve = null
          currentReject = null
          destroyRecognizer()
        },
        onPartialResults(bundle: any) {
          const text = firstRecognitionResult(bundle)
          if (text) interimText.value = text
        },
        onEvent() {},
      })

      invokeAndroid(recognizer, 'setRecognitionListener', recognitionListener)
      invokeAndroid(recognizer, 'startListening', intent)
    } catch (error) {
      finishWithError(error instanceof Error ? error.message : String(error))
    }
  })
}

export async function startListening(options?: { language?: string }): Promise<string> {
  if (!initializeSpeech()) throw new Error('当前设备没有可用的语音识别服务')
  if (recognizer) cancelListening()

  const granted = await requestMicrophonePermission()
  if (!granted) {
    speechState.value = 'idle'
    throw new Error('请允许麦克风权限后再试')
  }
  return listen(options?.language ?? 'zh-CN')
}

export function stopListening() {
  if (!recognizer) return
  speechState.value = 'processing'
  try {
    invokeAndroid(recognizer, 'stopListening')
  } catch {
    finishWithError('停止语音识别失败')
  }
}

export function cancelListening() {
  if (recognizer) {
    try {
      invokeAndroid(recognizer, 'cancel')
    } catch {
      // Runtime may already have stopped recording.
    }
  }
  currentResolve = null
  currentReject = null
  speechState.value = isSupported.value ? 'idle' : 'unavailable'
  destroyRecognizer()
}
