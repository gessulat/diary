export enum ConnectionState {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
}

export interface TranscriptListener {
  onTranscriptDelta?: (delta: string) => void;
  onTranscriptFinal?: (text: string) => void;
}

export interface RealtimeTranscriberCallbacks {
  onConnectionStateChange?: (state: ConnectionState) => void;
  onListeningChange?: (isListening: boolean) => void;
  onStatus?: (status: string) => void;
  onError?: (error: Error) => void;
  onTranscriptDelta?: (delta: string) => void;
  onTranscriptFinal?: (text: string) => void;
}

export interface StartListeningOptions {
  listener?: TranscriptListener;
}
