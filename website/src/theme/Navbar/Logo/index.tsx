import React, {type ReactNode} from 'react';

export default function NavbarLogo(): ReactNode {
  return (
    <a href="/" className="navbar__brand" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-md)',
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect x="14" y="20" width="10" height="28" rx="4" fill="white" opacity="0.65" />
          <rect x="27" y="14" width="10" height="36" rx="4" fill="white" />
          <rect x="40" y="22" width="10" height="22" rx="4" fill="white" opacity="0.8" />
          <circle cx="46" cy="16" r="4" fill="white" opacity="0.9" />
        </svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
          dbt-Workbench
        </span>
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-brand-primary)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
          </svg>
          Data Command Center
        </span>
      </div>
    </a>
  );
}
