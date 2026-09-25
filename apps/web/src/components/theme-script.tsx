export const THEME_STORAGE_KEY = 'sprout-theme';

/**
 * Applies the stored theme before first paint. Without this the page flashes
 * light before switching to dark, which is exactly the kind of jarring detail
 * §3.1 asks us to avoid.
 */
export function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
