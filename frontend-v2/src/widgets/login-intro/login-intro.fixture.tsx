import { LoginIntro } from "./ui/login-intro";

export default (
  <div className="max-w-lg rounded-card border border-line bg-panel">
    <LoginIntro
      brand="Andrey · 3D Platform"
      headline="Territories and models, rendered with precision"
      blurb="Heavy conversion runs server-side — the browser gets a compact GLB instead of a 100 MB OBJ."
      footnote="Sessions are stored in a secure cookie your browser sends only to this site."
      points={[
        { title: "Walk the site in 3D", hint: "Territories open straight in the browser — no plugins, no downloads." },
        { title: "Measure without a trip", hint: "Chain distances across pipe racks, tanks and clearances." },
        { title: "Only what you're assigned", hint: "Your administrator decides which territories you can open." },
      ]}
    />
  </div>
);
