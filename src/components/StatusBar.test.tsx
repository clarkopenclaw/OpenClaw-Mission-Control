import { renderToStaticMarkup } from 'react-dom/server';
import StatusBar from './StatusBar';

declare const describe: (name: string, run: () => void) => void;
declare const it: (name: string, run: () => void) => void;

function expectIncludes(markup: string, expected: string) {
  if (!markup.includes(expected)) {
    throw new Error(`Expected markup to include "${expected}", got: ${markup}`);
  }
}

describe('StatusBar', () => {
  it('renders the live clock shell and version label', () => {
    const markup = renderToStaticMarkup(<StatusBar initialNow={new Date('2026-03-12T10:20:30.000Z')} />);

    expectIncludes(markup, 'Mission Control v0.1');
    expectIncludes(markup, 'aria-label="Current time"');
    expectIncludes(markup, 'title="2026-03-12T10:20:30.000Z"');
  });

  it('renders the offline connection indicator state', () => {
    const markup = renderToStaticMarkup(
      <StatusBar initialNow={new Date('2026-03-12T10:20:30.000Z')} onlineOverride={false} />,
    );

    expectIncludes(markup, 'aria-label="Connection status: offline"');
    expectIncludes(markup, 'status-bar__dot offline');
  });
});
