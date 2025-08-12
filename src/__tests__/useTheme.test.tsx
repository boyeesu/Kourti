import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';

function ThemeConsumer() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={() => setTheme('dark')}>set dark</button>
    </>
  );
}

describe('useTheme', () => {
  it('provides default theme', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme-value').textContent).toBe('light');
  });

  it('updates theme and localStorage', () => {
    render(
      <ThemeProvider defaultTheme="light" storageKey="test-theme">
        <ThemeConsumer />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText('set dark'));
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    expect(window.localStorage.getItem('test-theme')).toBe('dark');
  });
});
