import React from 'react';
import Head from '@docusaurus/Head';
import {useLocation} from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function Root({children}: {children: React.ReactNode}) {
  const {siteConfig} = useDocusaurusContext();
  const {pathname} = useLocation();
  const canonicalUrl = new URL(
    `${siteConfig.baseUrl.replace(/\/$/, '')}${pathname}`,
    siteConfig.url,
  ).toString();
  const normalizedPath = pathname.toLowerCase();
  const isNoIndexRoute =
    normalizedPath.includes('/search') ||
    normalizedPath.endsWith('/404') ||
    normalizedPath.includes('/404.html');
  const robotsContent = isNoIndexRoute
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1';
  const googlebotContent = isNoIndexRoute
    ? 'noindex, follow'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
  const bingbotContent = isNoIndexRoute
    ? 'noindex, follow'
    : 'index, follow, max-snippet:-1, max-image-preview:large';

  return (
    <>
      <Head>
        <meta name="robots" content={robotsContent} />
        <meta name="googlebot" content={googlebotContent} />
        <meta name="bingbot" content={bingbotContent} />
        <link rel="canonical" href={canonicalUrl} />
        <link rel="alternate" hrefLang="en" href={canonicalUrl} />
        <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
      </Head>
      {children}
    </>
  );
}
