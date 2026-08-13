import { useId, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useAccessibleDialog } from "./useAccessibleDialog";

function TestDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useAccessibleDialog(onClose);
  const titleId = useId();

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <h2 id={titleId}>접근성 계약</h2>
      <button type="button">첫 번째</button>
      <button type="button">마지막</button>
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      {open && <TestDialog onClose={() => setOpen(false)} />}
    </>
  );
}

describe("useAccessibleDialog", () => {
  it("moves and traps focus, closes on Escape, and restores the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "열기" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "접근성 계약" });
    expect(dialog).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "첫 번째" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "마지막" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
