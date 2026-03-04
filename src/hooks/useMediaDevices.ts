import { useState, useCallback, useRef, useEffect } from "react";

export interface MediaDeviceState {
  localStream: MediaStream | null;
  cameraOn: boolean;
  micOn: boolean;
  error: string | null;
}

export function useMediaDevices() {
  const [state, setState] = useState<MediaDeviceState>({
    localStream: null,
    cameraOn: false,
    micOn: false,
    error: null,
  });
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async (video = true, audio = true) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
      streamRef.current = stream;
      setState({
        localStream: stream,
        cameraOn: video,
        micOn: audio,
        error: null,
      });
      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, error: message }));
      return null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState({ localStream: null, cameraOn: false, micOn: false, error: null });
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setState((s) => ({ ...s, cameraOn: videoTrack.enabled }));
    }
  }, []);

  const toggleMic = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setState((s) => ({ ...s, micOn: audioTrack.enabled }));
    }
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    ...state,
    startCamera,
    stopCamera,
    toggleCamera,
    toggleMic,
  };
}
