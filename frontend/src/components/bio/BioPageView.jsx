import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { resolveBioTheme, fontClass, readableTextColor, findBioIcon } from '../../utils/bioTheme';

/**
 * The themed backdrop of a bio page. The public page and the builder's
 * preview both render through this and BioPageView, so the preview is
 * exactly what visitors see.
 */
export const BioPageSurface = ({ theme: rawTheme, className = '', children }) => {
  const theme = resolveBioTheme(rawTheme);
  return (
    <div
      className={`flex justify-center px-4 py-14 ${fontClass(theme.font)} ${className}`}
      style={{ backgroundColor: theme.bgColor, color: readableTextColor(theme.bgColor) }}
    >
      <main className="flex w-full max-w-md flex-col items-center text-center">{children}</main>
    </div>
  );
};

const Avatar = ({ url, name, textColor }) => {
  const [failedUrl, setFailedUrl] = useState(null);
  if (!url || failedUrl === url) {
    return (
      <div
        className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold ring-2 ring-white/10"
        style={{ color: textColor, backgroundColor: 'rgba(127,127,127,0.18)' }}
        aria-hidden="true"
      >
        {(name || '?').trim().charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
      className="h-24 w-24 rounded-full object-cover ring-2 ring-white/10"
    />
  );
};

// Each item is a plain link to its Link's short URL, so a click goes
// through the same redirect and click tracking as any other short link.
// In a preview the link is inert, so editing never records a click.
const BioItem = ({ item, theme, isPreview }) => {
  const icon = findBioIcon(item.icon);
  return (
    <li>
      <a
        href={item.shortUrl}
        onClick={isPreview ? (e) => e.preventDefault() : undefined}
        tabIndex={isPreview ? -1 : undefined}
        className="flex min-h-[3.25rem] w-full items-center gap-3 rounded-xl px-5 py-3 text-sm font-semibold shadow-lg transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0"
        style={{
          backgroundColor: theme.primaryColor,
          color: readableTextColor(theme.primaryColor),
          outlineColor: theme.primaryColor,
        }}
      >
        {icon ? <img src={icon.src} alt="" className="h-5 w-5 shrink-0" /> : <span className="h-5 w-5 shrink-0" />}
        <span className="flex-1 break-words text-center">{item.label}</span>
        <span className="h-5 w-5 shrink-0" />
      </a>
    </li>
  );
};

/**
 * A bio page as visitors see it.
 * @param {{
 *   page: { slug: string, title?: string, bio?: string, avatarUrl?: string | null, theme?: object,
 *           items: { id: string, label: string, icon?: string | null, shortUrl: string }[] },
 *   isPreview?: boolean,
 *   className?: string,
 * }} props
 */
const BioPageView = ({ page, isPreview = false, className = '' }) => {
  const theme = resolveBioTheme(page.theme);
  const textColor = readableTextColor(theme.bgColor);
  const displayName = page.title || `@${page.slug}`;

  return (
    <BioPageSurface theme={theme} className={className}>
      <Avatar url={page.avatarUrl} name={displayName} textColor={textColor} />
      <h1 className="mt-4 break-words text-xl font-bold tracking-tight">{displayName}</h1>
      {page.bio && <p className="mt-2 max-w-sm whitespace-pre-line break-words text-sm opacity-80">{page.bio}</p>}

      {page.items.length > 0 ? (
        <ul className="mt-8 flex w-full flex-col gap-3">
          {page.items.map((item) => (
            <BioItem key={item.id} item={item} theme={theme} isPreview={isPreview} />
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-sm opacity-60">No links here yet.</p>
      )}

      {isPreview ? (
        <span className="mt-12 text-xs opacity-50">Made with Linkora</span>
      ) : (
        <RouterLink to="/" className="mt-12 text-xs opacity-50 transition-opacity hover:opacity-80">
          Made with Linkora
        </RouterLink>
      )}
    </BioPageSurface>
  );
};

export default BioPageView;
