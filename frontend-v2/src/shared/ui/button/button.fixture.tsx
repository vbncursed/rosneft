import { Icon } from "@/shared/ui/icon";
import { Button } from "./button";

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-3">
    <p className="m-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{label}</p>
    <div className="flex flex-wrap items-center gap-2.5">{children}</div>
  </div>
);

export default {
  variants: (
    <div className="flex flex-col gap-4.5 rounded-card border border-line bg-panel p-6">
      <Row label="Variants">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="accent">Accent soft</Button>
        <Button disabled>Disabled</Button>
      </Row>
      <Row label="Sizes & content">
        <Button variant="primary" size="sm">Small</Button>
        <Button variant="primary" size="md">Medium</Button>
        <Button variant="primary" size="lg">Large</Button>
        <Button>
          <Icon name="cube" size={14} />
          With icon
        </Button>
        <Button loading>Loading…</Button>
        <Button shape="icon" aria-label="Help">?</Button>
        <Button>
          Measure
          <kbd className="rounded border border-line-2 px-1.5 font-mono text-[10px] text-muted">M</kbd>
        </Button>
      </Row>
    </div>
  ),
  pills: (
    <div className="flex flex-wrap items-center gap-2.5 rounded-card border border-line bg-panel p-6">
      <Button shape="pill" variant="ghost">+ Upload</Button>
      <Button shape="pill" variant="primary">+ New user</Button>
      <Button shape="pill" variant="danger">Delete</Button>
      <Button shape="pill" variant="link">← Back to site</Button>
    </div>
  ),
};
