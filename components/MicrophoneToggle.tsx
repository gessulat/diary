import { StyleXStyles, create, props } from "@stylexjs/stylex";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { colors, spacing } from "../lib/Tokens.stylex";
import { ConnectionState, TranscriptListener } from "../lib/stt/types";
import { useTranscription } from "./TranscriptionProvider";

export interface MicrophoneToggleProps extends TranscriptListener {
  onStart?: () => void;
  onStop?: () => void;
  style?: StyleXStyles;
}

export const MicrophoneToggle = ({
  onStart,
  onStop,
  onTranscriptDelta,
  onTranscriptFinal,
  style,
}: MicrophoneToggleProps) => {
  const {
    hasApiKey,
    connectionState,
    listening,
    startListening,
    stopListening,
    status,
    error,
  } = useTranscription();

  const [isPending, setIsPending] = useState(false);
  const ownedSessionRef = useRef(false);

  const label = useMemo(() => {
    if (!hasApiKey && !listening) return "Add API key to enable microphone";
    if (connectionState === ConnectionState.Connecting || isPending)
      return "Connecting";
    if (listening) return "Stop recording";
    return "Start recording";
  }, [connectionState, hasApiKey, isPending, listening]);

  const title = error ?? status ?? label;

  const handleStart = useCallback(async () => {
    if (!hasApiKey && !listening) return;
    onStart?.();
    setIsPending(true);
    try {
      await startListening({
        onTranscriptDelta,
        onTranscriptFinal,
      });
      ownedSessionRef.current = true;
    } catch (err) {
      ownedSessionRef.current = false;
      throw err;
    } finally {
      setIsPending(false);
    }
  }, [
    hasApiKey,
    listening,
    onStart,
    startListening,
    onTranscriptDelta,
    onTranscriptFinal,
  ]);

  const handleStop = useCallback(() => {
    stopListening();
    if (ownedSessionRef.current) {
      ownedSessionRef.current = false;
      onStop?.();
    }
  }, [onStop, stopListening]);

  const handleClick = useCallback(async () => {
    if (listening) {
      handleStop();
      return;
    }
    if (!hasApiKey) return;
    try {
      await handleStart();
    } catch {
      // Swallow errors; provider surfaces status via context.
    }
  }, [handleStart, handleStop, hasApiKey, listening]);

  useEffect(() => {
    if (!listening && ownedSessionRef.current) {
      ownedSessionRef.current = false;
      onStop?.();
    }
  }, [listening, onStop]);

  useEffect(() => {
    return () => {
      if (ownedSessionRef.current) {
        stopListening({ clearListener: true });
        ownedSessionRef.current = false;
      }
    };
  }, [stopListening]);

  const disabled = (!hasApiKey && !listening) || isPending;
  const isConnecting =
    connectionState === ConnectionState.Connecting || isPending;

  return (
    <button
      type="button"
      onClick={() => {
        void handleClick();
      }}
      disabled={disabled}
      aria-pressed={listening}
      title={title}
      {...props([
        styles.button,
        listening && styles.listening,
        isConnecting && styles.connecting,
        disabled && styles.disabled,
        style,
      ])}
    >
      <span {...props(styles.indicator)} aria-hidden="true" />
      <span {...props(styles.label)}>{listening ? "Stop" : "Mic"}</span>
    </button>
  );
};

const styles = create({
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: "999px",
    backgroundColor: colors.background,
    color: colors.primary,
    paddingInline: "0.75rem",
    paddingBlock: "0.25rem",
    cursor: "pointer",
    minHeight: spacing.s,
    transition: "background-color 0.15s ease, border-color 0.15s ease",
    flexShrink: 0,
  },
  label: {
    fontSize: "0.85rem",
    lineHeight: "1.2",
  },
  indicator: {
    width: "0.55rem",
    height: "0.55rem",
    borderRadius: "50%",
    backgroundColor: colors.secondary,
    display: "inline-block",
  },
  listening: {
    backgroundColor: colors.hoverAndFocusBackground,
    borderColor: colors.hoverAndFocusBackground,
  },
  connecting: {
    borderColor: colors.secondary,
  },
  disabled: {
    cursor: "default",
    color: colors.secondary,
    borderColor: colors.border,
  },
});
