import * as S from "@effect/schema/Schema";
import { Id, useQuery } from "@evolu/react";
import { create, props } from "@stylexjs/stylex";
import { Either } from "effect";
import { FC, useCallback, useContext, useRef } from "react";
import { Temporal } from "temporal-polyfill";
import { NoteId, evolu, useEvolu } from "../lib/Db";
import {
  Content,
  ContentMax10k,
  ContentMax10kFromContent,
  emptyRoot,
  rootsAreEqual,
} from "../lib/Lexical";
import { NowContext } from "../lib/contexts/NowContext";
import { useCastTemporal } from "../lib/hooks/useCastTemporal";
import { Editor, EditorRef } from "./Editor";
import { MicrophoneToggle } from "./MicrophoneToggle";

const newNoteById = (id: NoteId) =>
  evolu.createQuery((db) =>
    db.selectFrom("_newNote").selectAll().where("id", "=", id),
  );

export const DayAddNote: FC<{
  day: Temporal.PlainDate;
  isVisible: boolean;
}> = ({ day, isVisible }) => {
  // Make NoteId from a day.
  const id = S.decodeSync(Id)(day.toString().padEnd(21, "0")) as NoteId;
  const { row } = useQuery(newNoteById(id), { once: true });

  const evolu = useEvolu();
  const contentRef = useRef<Content>();

  const handleEditorChange = useCallback(
    (content: Content) => {
      contentRef.current = content;
      evolu.update("_newNote", { id, content });
    },
    [evolu, id],
  );

  const now = useContext(NowContext);
  const castTemporal = useCastTemporal();
  const editorRef = useRef<EditorRef>(null);
  const transcriptRef = useRef({ inserted: "" });

  const addNewNote = useCallback(
    (content: ContentMax10k) => {
      const start = castTemporal(now.plainDateTimeISO().withPlainDate(day));
      evolu.create("note", { content, start });
      evolu.update("_newNote", { id, isDeleted: true }, () => {
        editorRef.current?.clear();
      });
    },
    [castTemporal, day, evolu, id, now],
  );

  const handleEditorKeyEnter = useCallback(() => {
    if (!contentRef.current) return;
    if (rootsAreEqual(emptyRoot, contentRef.current.root)) return;
    S.decodeEither(ContentMax10kFromContent)(contentRef.current).pipe(
      Either.match({
        onLeft: () => {
          alert("Too long, sorry.");
        },
        onRight: addNewNote,
      }),
    );
  }, [addNewNote]);

  const handleMainColumnClick = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const handleMicStart = useCallback(() => {
    transcriptRef.current = { inserted: "" };
    editorRef.current?.focus();
  }, []);

  const handleMicDelta = useCallback(
    (delta: string) => {
      if (!delta) return;
      transcriptRef.current.inserted += delta;
      editorRef.current?.insertText(delta);
    },
    [],
  );

  const handleMicFinal = useCallback((finalText: string) => {
    if (!finalText) return;
    const { inserted } = transcriptRef.current;
    let wroteText = inserted.length > 0;
    if (finalText.length > inserted.length) {
      const extra = finalText.slice(inserted.length);
      if (extra) {
        editorRef.current?.insertText(extra);
        transcriptRef.current.inserted += extra;
        wroteText = true;
      }
    }
    if (wroteText) {
      editorRef.current?.insertText("", { appendNewLine: true });
    }
    transcriptRef.current = { inserted: "" };
  }, []);

  return (
    <div {...props(styles.container)}>
      <div {...props(styles.firstColumn)} />
      <div {...props(styles.mainColumn)} onClick={handleMainColumnClick}>
        <div {...props(styles.editorRow)}>
          <Editor
            initialValue={row?.content?.root || emptyRoot}
            isVisible={isVisible}
            onChange={handleEditorChange}
            onKeyEnter={handleEditorKeyEnter}
            ref={editorRef}
            isApp
          />
          <MicrophoneToggle
            onStart={handleMicStart}
            onTranscriptDelta={handleMicDelta}
            onTranscriptFinal={handleMicFinal}
            style={styles.micButton}
          />
        </div>
      </div>
    </div>
  );
};

const styles = create({
  container: {
    display: "flex",
    flex: 1,
    alignItems: "baseline",
  },
  firstColumn: {
    flex: 1,
  },
  mainColumn: {
    display: "flex",
    flex: 6,
    alignSelf: "stretch",
    alignItems: "center",
  },
  editorRow: {
    display: "flex",
    flex: 1,
    alignItems: "center",
    gap: "0.75rem",
  },
  micButton: {
    marginInlineStart: "0.5rem",
  },
});
