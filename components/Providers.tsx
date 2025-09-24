import { EvoluProvider } from "@evolu/react";
import { FC, ReactNode } from "react";
import { evolu } from "../lib/Db";
import { IntlProvider } from "../lib/contexts/IntlContext";
import { NowProvider } from "../lib/contexts/NowContext";
import { UiStateProvider } from "../lib/contexts/UiStateContext";
import { TranscriptionProvider } from "./TranscriptionProvider";

// For quick timezone dev test:
// const now = Date.now;
// Date.now = () => now() - 1000 * 60 * 60 * 14;

export const Providers: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <EvoluProvider value={evolu}>
      <NowProvider>
        <IntlProvider>
          <TranscriptionProvider>
            <UiStateProvider>{children}</UiStateProvider>
          </TranscriptionProvider>
        </IntlProvider>
      </NowProvider>
    </EvoluProvider>
  );
};
