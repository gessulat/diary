import {
  ConnectionState,
  RealtimeTranscriberCallbacks,
} from "./types";

const REALTIME_MODEL = "gpt-4o-realtime-preview";
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

interface TeardownOptions {
  keepState?: boolean;
  preserveStatus?: boolean;
}

type JsonObject = Record<string, unknown>;

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getJsonObject = (obj: JsonObject, key: string): JsonObject | null => {
  const value = obj[key];
  return isJsonObject(value) ? value : null;
};

const getString = (obj: JsonObject, key: string): string | null => {
  const value = obj[key];
  return typeof value === "string" ? value : null;
};

export class RealtimeTranscriber {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mediaStream: MediaStream | null = null;
  private connectionState: ConnectionState = ConnectionState.Disconnected;
  private listening = false;
  private callbacks: RealtimeTranscriberCallbacks;
  private connectToken = 0;
  private activeTranscriptId: string | null = null;
  private currentPartial = "";

  constructor(private readonly apiKey: string, callbacks?: RealtimeTranscriberCallbacks) {
    if (!apiKey.trim()) {
      throw new Error("API key is required to initialise RealtimeTranscriber");
    }
    this.callbacks = callbacks ?? {};
  }

  public updateCallbacks(callbacks: RealtimeTranscriberCallbacks): void {
    this.callbacks = callbacks;
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public isListening(): boolean {
    return this.listening;
  }

  public async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.Connected) return;
    if (this.connectionState === ConnectionState.Connecting) return;
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      throw new Error("RealtimeTranscriber can only connect in a browser environment");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Browser does not support required media APIs");
    }

    const token = ++this.connectToken;
    this.setConnectionState(ConnectionState.Connecting);
    this.status("Requesting microphone.");

    this.teardown({ keepState: true, preserveStatus: true });

    let localStream: MediaStream | null = null;
    let localPc: RTCPeerConnection | null = null;
    let localDc: RTCDataChannel | null = null;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });

      if (!this.isCurrentToken(token)) {
        this.cleanupLocalConnection(localStream, localPc, localDc);
        return;
      }

      this.status("Building connection.");
      localPc = new RTCPeerConnection();
      const peer = localPc;
      peer.onconnectionstatechange = () =>
        this.handlePeerConnectionStateChange(token, peer);
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          track.enabled = false;
          peer.addTrack(track, localStream);
        });
      }

      if (!this.isCurrentToken(token)) {
        this.cleanupLocalConnection(localStream, localPc, localDc);
        return;
      }

      localDc = localPc.createDataChannel("oai-events");
      localDc.onmessage = (event) => this.onRealtimeEvent(event);
      localDc.onopen = () => this.handleDataChannelOpen(token);
      localDc.onclose = () => this.handleDataChannelClosed(token);

      const offer = await localPc.createOffer();

      if (!this.isCurrentToken(token)) {
        this.cleanupLocalConnection(localStream, localPc, localDc);
        return;
      }

      await localPc.setLocalDescription(offer);

      if (!this.isCurrentToken(token)) {
        this.cleanupLocalConnection(localStream, localPc, localDc);
        return;
      }

      this.status("Exchanging SDP.");
      const response = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp ?? "",
        },
      );

      if (!this.isCurrentToken(token)) {
        this.cleanupLocalConnection(localStream, localPc, localDc);
        return;
      }

      if (!response.ok) {
        throw new Error(
          `SDP exchange failed: ${response.status} ${response.statusText}`,
        );
      }

      const answerSdp = await response.text();

      if (!this.isCurrentToken(token)) {
        this.cleanupLocalConnection(localStream, localPc, localDc);
        return;
      }

      await localPc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      if (!this.isCurrentToken(token)) {
        this.cleanupLocalConnection(localStream, localPc, localDc);
        return;
      }

      this.pc = localPc;
      this.dc = localDc;
      this.mediaStream = localStream;

      this.status("Waiting for channel.");
    } catch (error) {
      this.cleanupLocalConnection(localStream, localPc, localDc);
      if (!this.isCurrentToken(token)) {
        return;
      }
      this.handleError(error);
      this.setConnectionState(ConnectionState.Disconnected);
    }
  }

  public disconnect(): void {
    this.invalidateConnectionAttempts();
    this.teardown();
  }

  public async startListening(): Promise<void> {
    if (this.connectionState === ConnectionState.Disconnected) {
      await this.connect();
      if (this.connectionState !== ConnectionState.Connected) return;
    }
    if (this.listening) return;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    }
    this.resetTranscriptState();
    this.setListeningState(true);
    this.status("Listening.");
  }

  public stopListening({ skipStatusUpdate = false } = {}): void {
    if (!this.listening) return;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
    this.setListeningState(false);
    if (!skipStatusUpdate) {
      this.status("Processing. Stand by.");
    }
  }

  public dispose(): void {
    this.disconnect();
    this.callbacks = {};
  }

  private setConnectionState(state: ConnectionState): void {
    if (state !== ConnectionState.Connected) {
      this.setListeningState(false);
    }
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.callbacks.onConnectionStateChange?.(state);
  }

  private setListeningState(isListening: boolean): void {
    if (this.listening === isListening) return;
    this.listening = isListening;
    this.callbacks.onListeningChange?.(isListening);
  }

  private status(message: string): void {
    const trimmed = message.trim();
    if (!trimmed) return;
    this.callbacks.onStatus?.(trimmed);
  }

  private handleError(error: unknown): void {
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "Unknown error");
    this.callbacks.onError?.(err);
  }

  private handleDataChannelOpen(token: number): void {
    if (!this.isCurrentToken(token)) return;
    this.status("Connected. Configuring.");
    this.setConnectionState(ConnectionState.Connected);
    this.resetTranscriptState();
    this.configureSession();
  }

  private handleDataChannelClosed(token: number): void {
    if (!this.isCurrentToken(token)) return;
    this.status("Connection closed.");
    this.teardown();
  }

  private handlePeerConnectionStateChange(
    token: number,
    peer: RTCPeerConnection,
  ): void {
    if (!this.isCurrentToken(token)) return;
    const state = peer.connectionState;
    if (state === "failed" || state === "disconnected" || state === "closed") {
      this.status("Connection lost.");
      this.teardown();
    }
  }

  private configureSession(): void {
    this.safeSend({
      type: "session.update",
      session: {
        instructions: "You are a transcription endpoint. Never speak back.",
        input_audio_transcription: { model: TRANSCRIPTION_MODEL },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 200,
          create_response: false,
          interrupt_response: false,
        },
      },
    });
  }

  private onRealtimeEvent = (event: MessageEvent): void => {
    const data = typeof event.data === "string" ? event.data : "";
    if (!data) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    if (!isJsonObject(parsed)) return;

    const type = getString(parsed, "type") ?? "";

    if (type === "error") {
      const errorObj = getJsonObject(parsed, "error");
      const message = (errorObj && getString(errorObj, "message")) || "unknown";
      this.status(`Error: ${message}`);
      this.callbacks.onError?.(new Error(message));
      return;
    }

    if (type === "response.created") {
      const responseObj = getJsonObject(parsed, "response");
      const responseId = responseObj ? getString(responseObj, "id") : null;
      if (responseId) {
        this.safeSend({
          type: "response.cancel",
          response: { id: responseId },
        });
      }
      return;
    }

    if (type === "conversation.item.input_audio_transcription.delta") {
      const itemId = getString(parsed, "item_id");
      const delta = getString(parsed, "delta");
      if (itemId && delta) {
        this.handleTranscriptDelta(itemId, delta);
      }
      return;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      const itemId = getString(parsed, "item_id");
      const transcript =
        getString(parsed, "transcript") ??
        getString(parsed, "text") ??
        "";
      if (itemId) {
        this.handleTranscriptComplete(itemId, transcript);
      }
      return;
    }

    if (type === "transcript.delta") {
      const itemId = getString(parsed, "item_id") ?? "default";
      const delta = getString(parsed, "delta");
      if (delta) {
        this.handleTranscriptDelta(itemId, delta);
      }
      return;
    }

    if (type === "transcript.completed") {
      const itemId = getString(parsed, "item_id") ?? "default";
      const text = getString(parsed, "text");
      if (text) {
        this.handleTranscriptComplete(itemId, text);
      }
      return;
    }

    if (type === "session.updated") {
      this.status("Ready.");
      return;
    }

    if (type === "response.error") {
      const errorObj = getJsonObject(parsed, "error");
      const message = (errorObj && getString(errorObj, "message")) || "unknown";
      this.status(`Error: ${message}`);
      this.callbacks.onError?.(new Error(message));
    }
  };

  private handleTranscriptDelta(itemId: string | null, delta: string): void {
    if (!itemId) return;
    if (this.activeTranscriptId !== itemId) {
      this.activeTranscriptId = itemId;
      this.currentPartial = "";
    }
    this.currentPartial += delta;
    this.callbacks.onTranscriptDelta?.(delta);
  }

  private handleTranscriptComplete(itemId: string | null, text: string): void {
    if (!itemId) return;
    if (this.activeTranscriptId !== itemId) {
      this.activeTranscriptId = itemId;
    }
    const finalText = typeof text === "string" ? text : "";
    if (finalText && finalText.length > this.currentPartial.length) {
      const extra = finalText.slice(this.currentPartial.length);
      if (extra) {
        this.callbacks.onTranscriptDelta?.(extra);
      }
    }
    if (finalText) {
      this.callbacks.onTranscriptFinal?.(finalText);
    }
    this.activeTranscriptId = null;
    this.currentPartial = "";
    this.status("Ready.");
  }

  private safeSend(obj: unknown): void {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(obj));
    }
  }

  private cleanupLocalConnection(
    stream: MediaStream | null,
    peer: RTCPeerConnection | null,
    dataChannel: RTCDataChannel | null,
  ): void {
    if (dataChannel) {
      try {
        dataChannel.onopen = null;
        dataChannel.onmessage = null;
        dataChannel.onclose = null;
        dataChannel.close();
      } catch {
        // Ignore cleanup errors.
      }
    }
    if (peer) {
      try {
        peer.onconnectionstatechange = null;
        peer.close();
      } catch {
        // Ignore cleanup errors.
      }
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  private teardown(options: TeardownOptions = {}): void {
    const { keepState = false, preserveStatus = false } = options;

    if (this.listening) {
      this.stopListening({ skipStatusUpdate: true });
    }

    if (this.dc) {
      try {
        this.dc.onopen = null;
        this.dc.onmessage = null;
        this.dc.onclose = null;
        this.dc.close();
      } catch {
        // Ignore teardown errors.
      }
      this.dc = null;
    }

    if (this.pc) {
      try {
        this.pc.onconnectionstatechange = null;
        this.pc.close();
      } catch {
        // Ignore teardown errors.
      }
      this.pc = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.resetTranscriptState();

    if (!keepState) {
      this.setConnectionState(ConnectionState.Disconnected);
      if (!preserveStatus) {
        this.status("Disconnected.");
      }
    }
  }

  private resetTranscriptState(): void {
    this.activeTranscriptId = null;
    this.currentPartial = "";
  }

  private invalidateConnectionAttempts(): void {
    this.connectToken += 1;
  }

  private isCurrentToken(token: number): boolean {
    return token === this.connectToken;
  }
}
