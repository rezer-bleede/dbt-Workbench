export type BreadcrumbItem = {
  name: string;
  url?: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type HowToStep = {
  name: string;
  text: string;
};

export type HowToData = {
  name: string;
  description: string;
  steps: HowToStep[];
};

export type WebPageData = {
  title: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
};

export type ArticleData = {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
  image?: string;
};

function resolveJsonLdUrl(url: string, siteBaseUrl: string) {
  if (/^https?:\/\//.test(url)) {
    return url;
  }

  if (url.startsWith('/')) {
    const parsedSiteUrl = new URL(siteBaseUrl);
    const basePath = parsedSiteUrl.pathname.endsWith('/')
      ? parsedSiteUrl.pathname
      : `${parsedSiteUrl.pathname}/`;
    const siteOrigin = `${parsedSiteUrl.protocol}//${parsedSiteUrl.host}`;
    const normalizedPath = `${basePath}${url.slice(1)}`.replace(/\/{2,}/g, '/');
    return new URL(normalizedPath, siteOrigin).toString();
  }

  return new URL(url, siteBaseUrl).toString();
}

export function buildBreadcrumbJsonLd(
  items: BreadcrumbItem[],
  canonicalUrl: string,
  siteBaseUrl: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
        ? resolveJsonLdUrl(item.url, siteBaseUrl)
        : index === items.length - 1
          ? canonicalUrl
          : siteBaseUrl,
    })),
  };
}

export function buildFaqJsonLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function buildHowToJsonLd(data: HowToData) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: data.name,
    description: data.description,
    step: data.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

export function buildWebPageJsonLd(data: WebPageData) {
  const result: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: data.title,
    description: data.description,
    url: data.url,
  };

  if (data.datePublished) {
    result.datePublished = data.datePublished;
  }
  if (data.dateModified) {
    result.dateModified = data.dateModified;
  }
  if (data.author) {
    result.author = {
      '@type': data.author === 'dbt-Workbench' ? 'Organization' : 'Person',
      name: data.author,
    };
  }

  return result;
}

export function buildArticleJsonLd(data: ArticleData) {
  const result: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: data.title,
    description: data.description,
    url: data.url,
    datePublished: data.datePublished,
    author: {
      '@type': 'Organization',
      name: data.author || 'dbt-Workbench',
    },
    publisher: {
      '@type': 'Organization',
      name: 'dbt-Workbench',
    },
  };

  if (data.dateModified) {
    result.dateModified = data.dateModified;
  }

  if (data.image) {
    result.image = data.image;
  }

  return result;
}

export function buildHomeJsonLdGraph(
  siteBaseUrl: string,
  repositoryUrl: string,
  organizationUrl: string,
) {
  const normalizedSiteBaseUrl = siteBaseUrl.endsWith('/')
    ? siteBaseUrl
    : `${siteBaseUrl}/`;
  const logoUrl = new URL('img/brand.svg', normalizedSiteBaseUrl).toString();
  const imageUrl = new URL('img/og-image-1200x630.png', normalizedSiteBaseUrl).toString();

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${normalizedSiteBaseUrl}#organization`,
        name: 'dbt-Workbench',
        url: normalizedSiteBaseUrl,
        logo: logoUrl,
        image: imageUrl,
        sameAs: [organizationUrl, repositoryUrl],
      },
      {
        '@type': 'WebSite',
        '@id': `${normalizedSiteBaseUrl}#website`,
        name: 'dbt-Workbench',
        url: normalizedSiteBaseUrl,
        inLanguage: 'en',
        description:
          'Open source dbt UI for lineage visualization, run orchestration, catalogs, and SQL workspace.',
        image: imageUrl,
        publisher: {
          '@id': `${normalizedSiteBaseUrl}#organization`,
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${normalizedSiteBaseUrl}search/?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${normalizedSiteBaseUrl}#software`,
        name: 'dbt-Workbench',
        applicationCategory: 'DeveloperApplication',
        applicationSubCategory: 'Data Engineering Tool',
        operatingSystem: 'Linux, macOS, Windows',
        description:
          'A lightweight, open-source UI for dbt that provides model browsing, lineage visualization, run orchestration, documentation previews, and environment management without vendor lock-in.',
        image: imageUrl,
        url: normalizedSiteBaseUrl,
        isAccessibleForFree: true,
        softwareHelp: `${normalizedSiteBaseUrl}docs/`,
        downloadUrl: repositoryUrl,
        featureList: [
          'Lineage visualization',
          'Column-level lineage',
          'Run orchestration',
          'SQL workspace',
          'Data catalog',
          'dbt docs viewer',
          'Scheduler with cron',
          'JWT authentication',
          'RBAC',
          'AI copilot',
          'Git integration',
          'Plugin system',
        ],
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        publisher: {
          '@id': `${normalizedSiteBaseUrl}#organization`,
        },
      },
      {
        '@type': 'SoftwareSourceCode',
        '@id': `${normalizedSiteBaseUrl}#source`,
        name: 'dbt-Workbench',
        codeRepository: repositoryUrl,
        programmingLanguage: 'TypeScript, Python',
        runtimePlatform: 'Docker, Node.js',
        license: `${repositoryUrl}/blob/main/LICENSE`,
        publisher: {
          '@id': `${normalizedSiteBaseUrl}#organization`,
        },
      },
    ],
  };
}
