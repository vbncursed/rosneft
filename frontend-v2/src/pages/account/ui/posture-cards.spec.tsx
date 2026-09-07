import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PostureCard } from "../model/posture";
import { PostureCards } from "./posture-cards";

const CARDS: PostureCard[] = [
  { label: "Two-factor", value: "TOTP", badge: "on", tone: "ok", hint: "A code from your authenticator." },
  { label: "Passkeys", value: "2", badge: "ok", tone: "ok", hint: "One-tap sign-in." },
  { label: "Password", value: "Set", badge: "fallback", tone: "neutral", hint: "Fallback factor." },
];

describe("PostureCards", () => {
  it("draws one card per entry, with its label, value, badge and hint", () => {
    render(<PostureCards cards={CARDS} />);
    expect(screen.getByText("Two-factor")).toBeInTheDocument();
    expect(screen.getByText("TOTP")).toBeInTheDocument();
    expect(screen.getByText("on")).toBeInTheDocument();
    expect(screen.getByText("A code from your authenticator.")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Set")).toBeInTheDocument();
  });

  it("maps each card's tone onto the badge's tone", () => {
    render(<PostureCards cards={CARDS} />);
    expect(screen.getByText("on").className).toContain("text-ok");
    expect(screen.getByText("fallback").className).toContain("border-line-2");
  });
});
