import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MessageContent, { sanitizeMarkdownLinkHref } from "./MessageContent";

describe("MessageContent link security", () => {
  it("renders safe markdown links as anchors", () => {
    render(<MessageContent content="[docs](https://example.com/docs)" />);

    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders unsafe markdown links as plain text", () => {
    render(<MessageContent content="[click](javascript:alert(1)) [data](data:text/html,test)" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/click/)).toBeInTheDocument();
    expect(screen.getByText(/data/)).toBeInTheDocument();
  });

  it("sanitizes markdown link protocols", () => {
    expect(sanitizeMarkdownLinkHref("https://example.com")).toBe("https://example.com");
    expect(sanitizeMarkdownLinkHref("mailto:ops@example.com")).toBe("mailto:ops@example.com");
    expect(sanitizeMarkdownLinkHref("/internal/path")).toBe("/internal/path");
    expect(sanitizeMarkdownLinkHref("javascript:alert(1)")).toBeNull();
    expect(sanitizeMarkdownLinkHref("//example.com/path")).toBeNull();
  });
});
