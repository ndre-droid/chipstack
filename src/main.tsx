import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
// Per-skin display fonts (latin subset to keep the bundle lean): casino = serif,
// playful = rounded/chunky, pokernacht = condensed grotesk. Minimal keeps the
// system sans, sci-fi keeps Orbitron.
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
// pokernacht = condensed broadcast grotesk. Oswald's figures are even-width, so it
// carries the ticking clock as well as the headings.
import '@fontsource/oswald/latin-400.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/oswald/latin-700.css';
import './styles.css';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';

/* The boundary sits OUTSIDE App on purpose: App mounts the store, and a state this
   build cannot load is the crash most worth surviving. See components/ErrorBoundary. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
