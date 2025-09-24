import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clearStoredApiKey,
  getStoredApiKey,
  setStoredApiKey,
  subscribeToApiKey,
} from "../lib/stt/apiKeyStorage";
import { RealtimeTranscriber } from "../lib/stt/realtimeTranscriber";
import {
  ConnectionState,
  RealtimeTranscriberCallbacks,
  TranscriptListener,
} from "../lib/stt/types";

interface StopOptions {
  clearListener?: boolean;
}

interface TranscriptionContextValue {
  apiKey: string | null;
  setApiKey: (value: string) => void;
  clearApiKey: () => void;
  connectionState: ConnectionState;
  listening: boolean;
  status: string;
  error: string | null;
  hasApiKey: boolean;
  ensureConnected: () => Promise<void>;
  startListening: (listener?: TranscriptListener) => Promise<void>;
  stopListening: (options?: StopOptions) => void;
  toggleListening: (listener?: TranscriptListener) => Promise<void>;
  disconnect: () => void;
}

const TranscriptionContext = createContext<TranscriptionContextValue | null>(null);

interface TranscriptionProviderProps {
  children: ReactNode;
}

export const TranscriptionProvider = ({ children }: TranscriptionProviderProps) => {
  const [apiKey, setApiKeyState] = useState<string | null>(() => getStoredApiKey());
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<string>("Disconnected.");
  const [error, setError] = useState<string | null>(null);

  const transcriberRef = useRef<RealtimeTranscriber | null>(null);
  const pendingConnectRef = useRef<Promise<void> | null>(null);
  const listenerRef = useRef<TranscriptListener | null>(null);
  const callbacksRef = useRef<RealtimeTranscriberCallbacks>({});

  useEffect(() => {
    callbacksRef.current = {
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        if (state === ConnectionState.Disconnected) {
          setListening(false);
        }
      },
      onListeningChange: (isListening) => {
        setListening(isListening);
      },
      onStatus: (message) => {
        setStatus(message);
        setError(null);
      },
      onError: (err) => {
        setError(err.message ?? String(err));
      },
      onTranscriptDelta: (delta) => {
        listenerRef.current?.onTranscriptDelta?.(delta);
      },
      onTranscriptFinal: (text) => {
        listenerRef.current?.onTranscriptFinal?.(text);
      },
    };
    transcriberRef.current?.updateCallbacks(callbacksRef.current);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToApiKey((value) => {
      setApiKeyState(value);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!apiKey) {
      transcriberRef.current?.disconnect();
      transcriberRef.current = null;
      listenerRef.current = null;
      setConnectionState(ConnectionState.Disconnected);
      setListening(false);
      setStatus("API key required.");
    }
  }, [apiKey]);

  const ensureTranscriber = useCallback(() => {
    if (!apiKey) return null;
    if (!transcriberRef.current) {
      transcriberRef.current = new RealtimeTranscriber(
        apiKey,
        callbacksRef.current,
      );
    }
    return transcriberRef.current;
  }, [apiKey]);

  const ensureConnected = useCallback(async () => {
    if (!apiKey) {
      setError("OpenAI API key required.");
      throw new Error("OpenAI API key required.");
    }
    const transcriber = ensureTranscriber();
    if (!transcriber) {
      setError("Unable to initialise transcription session.");
      throw new Error("Unable to initialise transcription session.");
    }

    const state = transcriber.getConnectionState();
    if (state === ConnectionState.Connected) return;
    if (pendingConnectRef.current) {
      await pendingConnectRef.current;
      return;
    }

    const promise = transcriber.connect();
    pendingConnectRef.current = promise;
    try {
      await promise;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      pendingConnectRef.current = null;
    }
  }, [apiKey, ensureTranscriber]);

  useEffect(() => {
    if (!apiKey) return;
    void ensureConnected().catch(() => {
      // Errors already surfaced via context error state.
    });
  }, [apiKey, ensureConnected]);

  const startListening = useCallback(
    async (listener?: TranscriptListener) => {
      listenerRef.current = listener ?? null;
      try {
        await ensureConnected();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect";
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      }
      try {
        await transcriberRef.current?.startListening();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to start listening";
        setError(errorMessage);
        throw err instanceof Error ? err : new Error(errorMessage);
      }
    },
    [ensureConnected],
  );

  const stopListening = useCallback(
    (options?: StopOptions) => {
      transcriberRef.current?.stopListening();
      if (options?.clearListener) {
        listenerRef.current = null;
      }
    },
    [],
  );

  const toggleListening = useCallback(
    async (listener?: TranscriptListener) => {
      const transcriber = ensureTranscriber();
      if (!transcriber) {
        setError("OpenAI API key required.");
        return;
      }

      if (transcriber.isListening()) {
        transcriber.stopListening();
        return;
      }

      listenerRef.current = listener ?? null;
      try {
        await ensureConnected();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect";
        setError(message);
        return;
      }
      try {
        await transcriber.startListening();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to start listening";
        setError(errorMessage);
      }
    },
    [ensureConnected, ensureTranscriber],
  );

  const disconnect = useCallback(() => {
    listenerRef.current = null;
    pendingConnectRef.current = null;
    if (transcriberRef.current) {
      transcriberRef.current.disconnect();
      transcriberRef.current = null;
    }
  }, []);

  const handleSetApiKey = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      setStoredApiKey(trimmed);
      setApiKeyState(trimmed);
    } else {
      clearStoredApiKey();
      setApiKeyState(null);
    }
  }, []);

  const handleClearApiKey = useCallback(() => {
    clearStoredApiKey();
    setApiKeyState(null);
  }, []);

  const contextValue = useMemo<TranscriptionContextValue>(
    () => ({
      apiKey,
      setApiKey: handleSetApiKey,
      clearApiKey: handleClearApiKey,
      connectionState,
      listening,
      status,
      error,
      hasApiKey: Boolean(apiKey),
      ensureConnected,
      startListening,
      stopListening,
      toggleListening,
      disconnect,
    }),
    [
      apiKey,
      connectionState,
      listening,
      status,
      error,
      handleSetApiKey,
      handleClearApiKey,
      ensureConnected,
      startListening,
      stopListening,
      toggleListening,
      disconnect,
    ],
  );

  return (
    <TranscriptionContext.Provider value={contextValue}>
      {children}
    </TranscriptionContext.Provider>
  );
};

export const useTranscription = (): TranscriptionContextValue => {
  const ctx = useContext(TranscriptionContext);
  if (ctx == null) {
    throw new Error("useTranscription must be used within TranscriptionProvider");
  }
  return ctx;
};
