import { Suspense } from "react";
import { TextNotes } from "@/modules/scratchpad/TextNotes";

export default function ScratchpadPage() {
  return (
    <Suspense fallback={null}>
      <TextNotes />
    </Suspense>
  );
}

