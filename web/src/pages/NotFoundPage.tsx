import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-sheet px-6 text-center">
      <BrandLogo onDark={false} size="md" showTagline />
      <h1 className="text-4xl text-navy">404</h1>
      <p className="max-w-md text-sm text-ink-3">
        We could not find that page. It may have been moved, or the link may be out of date.
      </p>
      <Link to="/" className="btn btn-primary">
        Back to dashboard
      </Link>
    </div>
  );
}
