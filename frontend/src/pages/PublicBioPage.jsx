import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { bioPageService } from '../services';
import BioPageView, { BioPageSurface } from '../components/bio/BioPageView';
import NotFound from './NotFound';

function usePublicBioPage(slug) {
  const [state, setState] = useState({ status: 'loading', page: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    setState({ status: 'loading', page: null });

    bioPageService
      .getPublicPage(slug)
      .then((res) => {
        if (!isCancelled) setState({ status: 'ready', page: res.bioPage });
      })
      .catch((err) => {
        if (isCancelled) return;
        setState({ status: err.response?.status === 404 ? 'not_found' : 'error', page: null });
      });

    return () => {
      isCancelled = true;
    };
  }, [slug, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

const PublicBioPage = () => {
  const { slug } = useParams();
  const { status, page, retry } = usePublicBioPage(slug);

  if (status === 'not_found') return <NotFound />;

  return (
    <>
      <Helmet>
        <title>{`${page?.title || `@${slug}`} | Linkora`}</title>
      </Helmet>

      {status === 'ready' ? (
        <BioPageView page={page} className="min-h-screen" />
      ) : (
        <BioPageSurface className="min-h-screen">
          {status === 'loading' && (
            <div className="mt-24 h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
          )}
          {status === 'error' && (
            <div className="mt-24 space-y-3">
              <p className="text-sm opacity-80">This page couldn&apos;t be loaded.</p>
              <button type="button" onClick={retry} className="text-sm font-semibold underline underline-offset-4">
                Try again
              </button>
            </div>
          )}
        </BioPageSurface>
      )}
    </>
  );
};

export default PublicBioPage;
