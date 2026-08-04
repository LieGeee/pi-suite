let audioContextRef: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const AudioContextCtor = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  if (!audioContextRef) {
    audioContextRef = new AudioContextCtor();
  }
  return audioContextRef;
}

export async function playNotificationTone(kind: "complete" | "error" | "attention") {
  const toneTarget = globalThis as typeof globalThis & {
    __PI_TEST_TONES?: string[];
    __piTestHooks?: {
      getTones?: () => string[];
      clearTones?: () => void;
      recordTone?: (tone: string) => void;
    };
  };
  const testTones = toneTarget.__PI_TEST_TONES;
  if (Array.isArray(testTones)) {
    testTones.push(kind);
  }
  toneTarget.__piTestHooks?.recordTone?.(kind);

  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return;
    }
  }

  const tones =
    kind === "error"
      ? [220, 180]
      : kind === "attention"
        ? [660, 880, 660]
        : [880, 1040];

  const now = context.currentTime;
  tones.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = now + index * 0.12;
    const endAt = startAt + 0.09;

    oscillator.type = kind === "error" ? "square" : "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt);
  });
}
