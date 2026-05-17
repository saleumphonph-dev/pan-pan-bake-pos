import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook to detect viewport size and return responsive breakpoint flags
 * Detects: mobile (<500px), tablet (500-900px), desktop (>900px)
 * Uses passive event listeners and debouncing for performance
 */
export function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  const debounceTimeoutRef = useRef(null);

  const handleResize = useCallback(() => {
    // Debounce resize to avoid excessive re-renders
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }, 150); // 150ms debounce
  }, []);

  useEffect(() => {
    // Add resize listener with passive option for better performance
    const options = { passive: true };
    window.addEventListener('resize', handleResize, options);

    // Initial size check
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });

    return () => {
      window.removeEventListener('resize', handleResize, options);
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [handleResize]);

  // Compute breakpoint flags
  const isMobile = windowSize.width < 500;
  const isTablet = windowSize.width >= 500 && windowSize.width < 900;
  const isDesktop = windowSize.width >= 900;
  const isSmallMobile = windowSize.width < 375;
  const isPortrait = windowSize.height > windowSize.width;
  const isLandscape = windowSize.width > windowSize.height;

  return {
    width: windowSize.width,
    height: windowSize.height,
    isMobile,
    isTablet,
    isDesktop,
    isSmallMobile,
    isPortrait,
    isLandscape,
    // Convenience methods
    isLargeScreen: windowSize.width >= 1200,
    isSmallScreen: windowSize.width < 768,
    isMediumScreen: windowSize.width >= 768 && windowSize.width < 1024,
  };
}

export default useWindowSize;
