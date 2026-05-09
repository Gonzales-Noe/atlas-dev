import React, { useState } from 'react';
// 1. Ensure Link and ROUTES are imported properly
import { Link } from 'react-router-dom';
import { ROUTES } from '../config/route';

import atlasLogo from '../assets/atlas-logo.png';
import atlasMascot from '../assets/atlas.png';

const LandingPage = () => {
  // State to manage mobile menu visibility
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Common link classes for reuse and clean code
  const navLinkClasses = "text-gray-800 hover:text-[#A52028] transition-colors font-semibold tracking-wide text-sm md:text-base px-2 py-1";
  const mobileNavLinkClasses = "block text-lg font-semibold text-gray-800 hover:text-[#A52028] transition-colors py-3 px-6";

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Navigation Bar - Made full width but with content centering */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0">
            <Link to="/">
              <img 
                src={atlasLogo} 
                alt="ATLAS Logo" 
                className="h-9 md:h-10 object-contain"
              />
            </Link>
          </div>

          {/* Desktop Navigation Links - Hidden on mobile, visible on md+ */}
          <div className="hidden md:flex space-x-6 lg:space-x-10 items-center">
            <Link to="/" className={`${navLinkClasses} text-[#A52028]`}>HOME</Link>
            <Link to={ROUTES.SIGN_UP} className={navLinkClasses}>SIGN UP</Link>
            <Link to="/pricing" className={navLinkClasses}>PRICING</Link>
            <Link to="/contact" className={navLinkClasses}>CONTACT</Link>
          </div>

          {/* Mobile Menu Button - Visible only on small screens */}
          <div className="md:hidden">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-700 hover:text-[#A52028] focus:outline-none focus:ring-2 focus:ring-[#A52028] rounded-lg p-2"
              aria-label="Toggle mobile menu"
            >
              {isMenuOpen ? (
                // Close Icon (X)
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l18 18" />
                </svg>
              ) : (
                // Hamburger Icon
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu - Conditionally rendered, stacks links */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-b border-gray-100 animate-fade-in-down">
            <div className="space-y-1 pb-4 pt-2">
              <Link to="/" onClick={() => setIsMenuOpen(false)} className={`${mobileNavLinkClasses} text-[#A52028] bg-red-50`}>HOME</Link>
              <Link to={ROUTES.SIGN_UP} onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClasses}>SIGN UP</Link>
              <Link to="/pricing" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClasses}>PRICING</Link>
              <Link to="/contact" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClasses}>CONTACT</Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section - Stacks on mobile, side-by-side on md+ */}
      {/* 2. Space is reduced! mt-8 on mobile, mt-12 on desktop */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 mt-8 md:mt-12 flex flex-col md:flex-row items-center justify-between pb-16 md:pb-24">
        
        {/* Left Column: Text and Buttons (stacks on top) */}
        <div className="w-full md:flex-1 max-w-2xl text-center md:text-left">
          <h1 className="text-[#A52028] text-4xl sm:text-5xl md:text-6xl font-bold leading-tight drop-shadow-sm">
            Bring the Passion. <br />
            <span className="italic">We'll Bring the Platform.</span>
          </h1>
          
          <p className="mt-6 text-gray-600 text-base sm:text-lg leading-relaxed max-w-xl mx-auto md:mx-0 px-2 sm:px-0">
            The all-in-one instructional engine that turns objectives into aligned modules, balanced exams, and actionable insights.
          </p>

          {/* Button container: stacks on mobile, horizontal on sm+ */}
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center md:justify-start px-4 sm:px-0 max-w-sm sm:max-w-none mx-auto md:mx-0">
            <Link to={ROUTES.SIGN_UP}>
              <button className="bg-[#A52028] text-white font-semibold py-3 px-8 rounded border border-[#8B1A20] hover:bg-[#8B1A20] transition-colors shadow-sm w-full sm:w-auto">
                Join ATLAS Now!
              </button>
            </Link>
            <Link to="/how-it-works">
              <button className="bg-[#FDF9F9] text-gray-900 font-semibold py-3 px-8 rounded border border-gray-800 hover:bg-gray-100 transition-colors w-full sm:w-auto">
                See How it Works
              </button>
            </Link>
          </div>
        </div>

        {/* Right Column: Character Image (stacks on bottom) */}
        {/* We center this column when stacked, and right-align it when side-by-side */}
        <div className="w-full md:flex-1 flex justify-center md:justify-end mt-12 md:mt-0 px-8 md:px-0">
          <img 
            src={atlasMascot} 
            alt="ATLAS Mascot" 
            // 3. The image now scales down smoothly and maxes out
            className="w-full max-w-[320px] md:max-w-[450px] object-contain drop-shadow-md animate-fade-in-right"
          />
        </div>

      </main>
    </div>
  );
};

export default LandingPage;