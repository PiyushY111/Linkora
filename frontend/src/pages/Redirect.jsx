import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

const Redirect = () => {
  const { shortCode } = useParams();

  useEffect(() => {
    // Redirect to the backend redirect endpoint
    if (shortCode) {
      window.location.href = `/api/r/${shortCode}`;
    }
  }, [shortCode]);

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <p>Redirecting...</p>
    </div>
  );
};

export default Redirect;
