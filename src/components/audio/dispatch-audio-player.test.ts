import { describe, expect, it, vi } from "vitest";
import { stopDispatchAudioResources } from "./dispatch-audio-player";

describe("stopDispatchAudioResources", () => {
  it("detaches audio event handlers before pausing and clearing src so onerror fallback cannot fire on navigation", () => {
    const fallbackSpy = vi.fn();
    let onErrorRef: (() => void) | null = fallbackSpy;

    const mockAudio = {
      onloadedmetadata: vi.fn(),
      ontimeupdate: vi.fn(),
      onended: vi.fn(),
      get onerror() {
        return onErrorRef;
      },
      set onerror(fn: (() => void) | null) {
        onErrorRef = fn;
      },
      pause: vi.fn(),
      removeAttribute: vi.fn((attr: string) => {
        // Simulate browser behavior where clearing src triggers onerror if still attached
        if (attr === "src" && onErrorRef) {
          onErrorRef();
        }
      }),
      load: vi.fn(() => {
        if (onErrorRef) {
          onErrorRef();
        }
      }),
    };

    const mockUtterance = {
      onend: vi.fn(),
      onerror: vi.fn(),
    };

    const mockAbortController = {
      abort: vi.fn(),
    };

    const mockSpeechSynthesis = {
      cancel: vi.fn(),
    };

    stopDispatchAudioResources({
      audio: mockAudio as unknown as HTMLAudioElement,
      utterance: mockUtterance as unknown as SpeechSynthesisUtterance,
      abortController: mockAbortController as unknown as AbortController,
      speechSynthesis: mockSpeechSynthesis,
    });

    expect(mockAbortController.abort).toHaveBeenCalledTimes(1);
    expect(mockAudio.onloadedmetadata).toBeNull();
    expect(mockAudio.ontimeupdate).toBeNull();
    expect(mockAudio.onended).toBeNull();
    expect(mockAudio.onerror).toBeNull();
    expect(mockAudio.pause).toHaveBeenCalledTimes(1);
    expect(mockAudio.removeAttribute).toHaveBeenCalledWith("src");
    expect(mockAudio.load).toHaveBeenCalledTimes(1);
    // Crucial: clearing src must NEVER invoke the onerror -> Web Speech fallback!
    expect(fallbackSpy).not.toHaveBeenCalled();

    expect(mockUtterance.onend).toBeNull();
    expect(mockUtterance.onerror).toBeNull();
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(1);
  });

  it("handles null resources gracefully", () => {
    expect(() =>
      stopDispatchAudioResources({
        audio: null,
        utterance: null,
        abortController: null,
        speechSynthesis: null,
      }),
    ).not.toThrow();
  });
});
