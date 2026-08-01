import { useEffect } from 'react';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap';

/**
 * Loads Inter + DM Mono from Google Fonts exactly once. Mounted at the
 * root of the Adoption Analytics page so the fonts are only pulled in when the
 * dashboard is actually rendered.
 */
export function useAdoptionAnalyticsFonts(): void {
  useEffect(() => {
    if (document.querySelector('link[data-adoption-analytics-fonts]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONTS_HREF;
    link.setAttribute('data-adoption-analytics-fonts', 'true');
    document.head.appendChild(link);
  }, []);
}
