import {
  NonEmptyString1000,
  parseMnemonic,
  useEvolu,
  useOwner,
} from "@evolu/react";
import { create, props } from "@stylexjs/stylex";
import { Effect, Exit } from "effect";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { PageWithTitle } from "../../components/PageWithTitle";
import { Text } from "../../components/Text";
import { TextInput } from "../../components/TextInput";
import { useTranscription } from "../../components/TranscriptionProvider";
import { prompt } from "../../lib/Prompt";
import { colors, fonts } from "../../lib/Tokens.stylex";
import { ConnectionState } from "../../lib/stt/types";

export default function Settings() {
  const owner = useOwner();
  const evolu = useEvolu();

  const [showMnemonic, setShowMnemonic] = useState(false);

  const handleShowMnemonicPress = () => {
    setShowMnemonic(!showMnemonic);
  };

  const handleRestoreOwnerPress = () => {
    prompt(NonEmptyString1000, "Your Mnemonic", (mnemonic) => {
      void parseMnemonic(mnemonic)
        .pipe(Effect.runPromiseExit)
        .then(
          Exit.match({
            onFailure: (error) => {
              alert(JSON.stringify(error, null, 2));
            },
            onSuccess: (mnemonic) => {
              evolu.restoreOwner(mnemonic);
            },
          }),
        );
    });
  };

  const handleResetOwnerPress = () => {
    if (confirm("Are you sure? It will delete all your local data."))
      evolu.resetOwner();
  };

  return (
    <PageWithTitle title="Settings">
      <Button
        variant="webBig"
        title={showMnemonic ? "Hide Mnemonic" : "Show Mnemonic"}
        onPress={handleShowMnemonicPress}
      />
      {showMnemonic && owner && (
        <Text tag="p" style={styles.mnemonic}>
          {owner.mnemonic}
        </Text>
      )}
      <Button
        variant="webBig"
        title="Restore Owner"
        onPress={handleRestoreOwnerPress}
      />
      <Button
        variant="webBig"
        title="Reset Owner"
        onPress={handleResetOwnerPress}
      />
      <OpenAiKeySection />
    </PageWithTitle>
  );
}

const styles = create({
  mnemonic: {
    textWrap: "balance",
    textAlign: "center",
    fontFamily: fonts.mono,
  },
});

const sectionStyles = create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    marginTop: "1rem",
    marginBottom: "1rem",
    alignItems: "center",
  },
  inputRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto auto",
    gap: "0.5rem",
    alignItems: "center",
    width: "100%",
    maxWidth: "400px",
  },
  input: {
    width: "100%",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    borderRadius: "0.5rem",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  actionButton: {
    cursor: "pointer",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingInline: "0.75rem",
    paddingBlock: "0.5rem",
    borderRadius: "0.5rem",
    color: colors.primary,
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonActive: {
    backgroundColor: colors.hoverAndFocusBackground,
  },
  actionButtonDisabled: {
    color: colors.secondary,
    cursor: "not-allowed",
  },
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusDisconnected: {
    backgroundColor: "#808080",
  },
  statusConnecting: {
    backgroundColor: "#FFA500",
  },
  statusConnected: {
    backgroundColor: "#00C851",
  },
  statusText: {
    textAlign: "center",
    color: colors.primary,
  },
});


const OpenAiKeySection = () => {
  const {
    apiKey,
    setApiKey,
    clearApiKey,
    connectionState,
    hasApiKey,
  } = useTranscription();

  const [showSection, setShowSection] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [inputValue, setInputValue] = useState(apiKey ?? "");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(apiKey ?? "");

  useEffect(() => {
    lastSavedRef.current = apiKey ?? "";
    setInputValue(apiKey ?? "");
  }, [apiKey]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const persistKey = useCallback(
    (value: string, options: { force?: boolean } = {}) => {
      const trimmed = value.trim();
      if (!trimmed) {
        if (options.force || lastSavedRef.current) {
          clearApiKey();
          lastSavedRef.current = "";
        }
        return;
      }

      if (!options.force && trimmed === lastSavedRef.current) return;
      setApiKey(trimmed);
      lastSavedRef.current = trimmed;
    },
    [clearApiKey, setApiKey],
  );

  const scheduleSave = useCallback(
    (value: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        persistKey(value);
        saveTimer.current = null;
      }, 600);
    },
    [persistKey],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setInputValue(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const handleBlur = useCallback(() => {
    persistKey(inputValue, { force: true });
  }, [inputValue, persistKey]);

  const handleToggleShow = useCallback(() => {
    setShowKey((prev) => !prev);
  }, []);

  const handleClear = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setInputValue("");
    lastSavedRef.current = "";
    clearApiKey();
  }, [clearApiKey]);

  const handleToggleSection = () => {
    setShowSection(!showSection);
  };

  const canClear = hasApiKey || Boolean(inputValue);

  return (
    <>
      <Button
        variant="webBig"
        title={showSection ? "Hide Speech-to-text API key" : "Speech-to-text API key"}
        onPress={handleToggleSection}
      />
      {showSection && (
        <div {...props(sectionStyles.container)}>
          <Text tag="p" style={sectionStyles.statusText}>
            Enter your OpenAI API key to enable microphone dictation
          </Text>
          <div {...props(sectionStyles.inputRow)}>
            <div
              {...props([
                sectionStyles.statusDot,
                connectionState === ConnectionState.Disconnected && sectionStyles.statusDisconnected,
                connectionState === ConnectionState.Connecting && sectionStyles.statusConnecting,
                connectionState === ConnectionState.Connected && sectionStyles.statusConnected,
              ])}
              aria-label={
                connectionState === ConnectionState.Connected ? "Connected" :
                connectionState === ConnectionState.Connecting ? "Connecting" : "Disconnected"
              }
            />
            <TextInput
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleBlur}
              placeholder="sk-..."
              spellCheck={false}
              autoComplete="off"
              type={showKey ? "text" : "password"}
              style={sectionStyles.input}
            />
            <button
              type="button"
              onClick={handleToggleShow}
              {...props([
                sectionStyles.actionButton,
                showKey && sectionStyles.actionButtonActive,
              ])}
              aria-pressed={showKey}
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              <i className={showKey ? "fas fa-eye-slash" : "fas fa-eye"}></i>
            </button>
            <button
              type="button"
              onClick={handleClear}
              {...props([
                sectionStyles.actionButton,
                !canClear && sectionStyles.actionButtonDisabled,
              ])}
              disabled={!canClear}
              aria-label="Clear API key"
            >
              <i className="fas fa-trash"></i>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
