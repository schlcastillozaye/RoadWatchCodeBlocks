import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import type { PlaceResult } from '../lib/types';
import { Spinner } from './Feedback';

const RECENT_SEARCHES_KEY = 'rw_recent_searches_web';
const MAX_RECENT_SEARCHES = 8;

function loadRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(searches: string[]): void {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
  } catch {
    // Ignore localStorage errors
  }
}

function addRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  
  const existing = loadRecentSearches();
  const updated = [
    trimmed,
    ...existing.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, MAX_RECENT_SEARCHES);
  
  saveRecentSearches(updated);
}

function removeRecentSearch(query: string): void {
  const existing = loadRecentSearches();
  const updated = existing.filter((item) => item.toLowerCase() !== query.toLowerCase());
  saveRecentSearches(updated);
}

function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Ignore localStorage errors
  }
}

interface PlaceSearchProps {
  /** Called when the user picks a resolved place. */
  onSelect: (place: PlaceResult) => void;
  /**
   * Called when the address could not be resolved (no key, billing disabled,
   * no match…). The caller degrades to filtering reports by text instead.
   */
  onUnavailable?: (reason: string, query: string) => void;
  /** Called when a new search starts, so the caller can clear a previous origin. */
  onReset?: () => void;
}

/**
 * Address / landmark search box with debounced search and recent searches.
 *
 * Geocoding is an optional feature: when the server reports it is unavailable
 * we never leave the user stuck — the reason is shown and the caller is told to
 * fall back to text filtering.
 */
export function PlaceSearch({ onSelect, onUnavailable, onReset }: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  // Debounced search
  const debouncedSearch = useCallback((searchQuery: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      runSearch(searchQuery);
    }, 400);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const runSearch = async (searchQuery?: string) => {
    const q = (searchQuery ?? query).trim();
    if (q.length < 2) {
      setError('Type at least 2 characters to search.');
      return;
    }

    setLoading(true);
    setError(null);
    setReason(null);
    setResults(null);
    onReset?.();

    try {
      const response = await api.searchPlace(q);
      if (response.available && response.results.length > 0) {
        setResults(response.results);
        // Save successful search to recent searches
        addRecentSearch(q);
        setRecentSearches(loadRecentSearches());
        return;
      }
      const message = response.reason ?? 'No matching place was found.';
      setResults([]);
      setReason(message);
      onUnavailable?.(message, q);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Address search failed.';
      setResults([]);
      setReason(message);
      onUnavailable?.(message, q);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setQuery('');
    setResults(null);
    setReason(null);
    setError(null);
    inputRef.current?.focus();
  };

  const handleSelectRecent = (search: string) => {
    setQuery(search);
    runSearch(search);
    setShowRecent(false);
  };

  const handleRemoveRecent = (search: string) => {
    removeRecentSearch(search);
    setRecentSearches(loadRecentSearches());
  };

  const handleClearAllRecent = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setQuery(value);
    
    if (value.trim().length >= 2) {
      debouncedSearch(value);
    } else {
      setResults(null);
      setReason(null);
      setError(null);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (!query.trim() && recentSearches.length > 0) {
      setShowRecent(true);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Delay hiding to allow clicks on recent searches
    setTimeout(() => setShowRecent(false), 200);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && query.trim().length >= 2) {
      event.preventDefault();
      runSearch();
    }
  };

  return (
    <div className="relative">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim().length >= 2) {
            void runSearch();
          }
        }}
      >
        <label className="sr-only" htmlFor="place-search">
          Search an address or landmark
        </label>
        <input
          ref={inputRef}
          id="place-search"
          className="brand-input flex-1"
          placeholder="Search an address or landmark…"
          value={query}
          autoComplete="off"
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className="btn btn-primary btn-sm shrink-0" disabled={loading || query.trim().length < 2}>
          {loading ? <Spinner size={16} /> : 'Search'}
        </button>
        {(query || results || reason) && (
          <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={clear}>
            Clear
          </button>
        )}
        {recentSearches.length > 0 && isFocused && !query.trim() && (
          <button
            type="button"
            className="btn btn-secondary btn-sm shrink-0"
            onClick={() => setShowRecent(true)}
            aria-label="Recent searches"
          >
            🕐
          </button>
        )}
      </form>

      {error && <p className="mt-2 text-xs text-red">{error}</p>}

      {loading && (
        <p className="mt-2 flex items-center gap-2 text-xs text-ink-3">
          <Spinner size={14} /> Looking up that place…
        </p>
      )}

      {results && results.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-brand-sm border border-azure bg-surface shadow-sm">
          {results.map((place, index) => (
            <li key={`${place.lat},${place.lng},${index}`}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 border-b border-azure px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-sheet"
                onClick={() => {
                  onSelect(place);
                  setQuery(place.address);
                  setResults(null);
                  setShowRecent(false);
                }}
              >
                <span className="font-medium text-navy">{place.address}</span>
                <span className="text-xs text-ink-3">
                  {place.areaLabel ? `${place.areaLabel} · ` : ''}
                  {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {reason && (
        <div className="mt-2 rounded-brand-sm border border-amber/30 bg-amber-tint px-3 py-2 text-xs text-ink-2">
          <p className="font-medium text-ink">Address search unavailable</p>
          <p className="mt-0.5">{reason}</p>
          <p className="mt-1">Showing reports that match "{query.trim()}" instead.</p>
        </div>
      )}

      {showRecent && recentSearches.length > 0 && (
        <div className="mt-2 rounded-brand-sm border border-azure bg-surface shadow-sm max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-azure">
            <span className="flex items-center gap-2 text-xs font-medium text-ink">
              <span>🕐</span> Recent searches
            </span>
            <button
              type="button"
              className="text-xs text-navy hover:underline"
              onClick={handleClearAllRecent}
            >
              Clear all
            </button>
          </div>
          {recentSearches.map((search) => (
            <button
              key={search}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-sheet last:border-b-0"
              onClick={() => handleSelectRecent(search)}
            >
              <span className="flex items-center gap-2 text-ink-2">
                <span className="text-ink-3">🕐</span>
                <span className="truncate">{search}</span>
              </span>
              <button
                type="button"
                className="text-ink-3 hover:text-red p-1 rounded transition"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveRecent(search);
                }}
                aria-label={`Remove "${search}" from recent searches`}
              >
                ×
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}