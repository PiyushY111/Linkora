import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';

/** Renders the current path so tests can assert where navigation went. */
export function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

/**
 * Renders `ui` inside the app's providers, with the real <Toaster/> so tests
 * assert on the messages a user actually sees.
 * @param {import('react').ReactElement} ui
 * @param {{ route?: string, path?: string }} [options] - `path` mounts `ui`
 *   at a route pattern (e.g. '/:shortCode') so useParams works.
 */
export function renderWithProviders(ui, { route = '/', path } = {}) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path || '*'} element={ui} />
          <Route path="/dashboard" element={<div>dashboard page</div>} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
      <Toaster />
    </HelmetProvider>
  );
}
