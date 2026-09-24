import { StandaloneHeader } from "./ui/standalone-header";

export default {
  withHomeLink: (
    <div className="p-6">
      <StandaloneHeader brandHref="/" />
    </div>
  ),
  withTrailing: (
    <div className="p-6">
      <StandaloneHeader>
        <span className="text-xs">a.ivanova</span>
      </StandaloneHeader>
    </div>
  ),
};
