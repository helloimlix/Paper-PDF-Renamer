(function () {
  const DEFAULT_SETTINGS = {
    enabled: true,
    confirmBeforeRename: true,
    allowNetwork: true,
    overwriteSameName: false,
    filenameTemplate: "{title}",
    maxFilenameLength: 180,
    enabledSites: {
      arxiv: true,
      openreview: true
    }
  };

  function mergeSettings(value) {
    const incoming = value || {};
    return {
      ...DEFAULT_SETTINGS,
      ...incoming,
      enabledSites: {
        ...DEFAULT_SETTINGS.enabledSites,
        ...(incoming.enabledSites || {})
      }
    };
  }

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function decodeEntities(value) {
    const named = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: "\"",
      apos: "'",
      nbsp: " "
    };

    return String(value || "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
      if (body[0] === "#") {
        const isHex = body[1] && body[1].toLowerCase() === "x";
        const codePoint = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
        if (Number.isFinite(codePoint)) {
          try {
            return String.fromCodePoint(codePoint);
          } catch (error) {
            return match;
          }
        }
        return match;
      }

      return Object.prototype.hasOwnProperty.call(named, body) ? named[body] : match;
    });
  }

  function normalizeTitle(value) {
    let title = decodeEntities(value);
    title = title.replace(/<[^>]+>/g, " ");
    title = title.replace(/^Title:\s*/i, "");
    title = normalizeWhitespace(title);
    if (!title || title.length < 4) {
      return "";
    }
    const lower = title.toLowerCase();
    if (lower === "pdf" || lower === "download" || lower === "openreview" || lower === "arxiv.org") {
      return "";
    }
    return title;
  }

  function sanitizeFilename(value, options) {
    const maxLength = Math.max(32, Number(options && options.maxLength) || DEFAULT_SETTINGS.maxFilenameLength);
    let filename = normalizeWhitespace(value);
    filename = filename.replace(/[\/\\:*?"<>|]/g, " - ");
    filename = filename.replace(/[\u0000-\u001f\u007f]/g, "");
    filename = filename.replace(/\s+-\s+/g, " - ");
    filename = filename.replace(/\s+/g, " ");
    filename = filename.replace(/(?:\s+-\s*)+$/g, "");
    filename = filename.replace(/^(?:\s*-\s+)+/g, "");
    filename = filename.replace(/[. ]+$/g, "");
    filename = filename.replace(/^[. ]+/g, "");

    if (filename.length > maxLength) {
      filename = filename.slice(0, maxLength).replace(/[. ]+$/g, "");
    }

    return filename || "paper";
  }

  function ensurePdfExtension(value, settings) {
    const withoutExtension = String(value || "").replace(/\.pdf$/i, "");
    return `${sanitizeFilename(withoutExtension, { maxLength: settings && settings.maxFilenameLength })}.pdf`;
  }

  function renderFilenameTemplate(template, metadata, settings) {
    const paper = normalizePaperMetadata(metadata);
    const fallbackTemplate = DEFAULT_SETTINGS.filenameTemplate;
    const rawTemplate = normalizeWhitespace(template || fallbackTemplate) || fallbackTemplate;
    const values = {
      title: paper.title,
      date: paper.date,
      year: paper.year,
      authors: paper.authors,
      firstAuthor: paper.firstAuthor,
      source: paper.source,
      sourceId: paper.sourceId
    };

    const rendered = rawTemplate.replace(/\{([a-zA-Z]+)\}/g, (match, key) => {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] || "" : match;
    });

    const filenameStem = normalizeWhitespace(rendered) || paper.title || "paper";
    return ensurePdfExtension(filenameStem, settings);
  }

  function normalizePaperMetadata(metadata) {
    const incoming = metadata || {};
    const authors = normalizeAuthors(incoming.authors);
    const firstAuthor = normalizeTitle(incoming.firstAuthor) || getFirstAuthor(authors);
    const date = normalizeDate(incoming.date || incoming.published || incoming.publicationDate);
    const year = normalizeYear(incoming.year || date);

    return {
      title: normalizeTitle(incoming.title),
      authors,
      firstAuthor,
      date,
      year,
      source: normalizeWhitespace(incoming.source),
      sourceId: normalizeWhitespace(incoming.sourceId || incoming.paperId)
    };
  }

  function normalizeAuthors(value) {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeWhitespace(item)).filter(Boolean).join(", ");
    }
    return normalizeWhitespace(value);
  }

  function getFirstAuthor(authors) {
    return normalizeWhitespace(String(authors || "").split(/,| and /i)[0]);
  }

  function normalizeDate(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      const milliseconds = value > 100000000000 ? value : value * 1000;
      return new Date(milliseconds).toISOString().slice(0, 10);
    }

    const text = normalizeWhitespace(value);
    if (/^\d{10,13}$/.test(text)) {
      const numeric = Number(text);
      const milliseconds = numeric > 100000000000 ? numeric : numeric * 1000;
      return new Date(milliseconds).toISOString().slice(0, 10);
    }

    const match = text.match(/(\d{4})(?:[-\/](\d{2})(?:[-\/](\d{2}))?)?/);
    if (!match) {
      return "";
    }
    return [match[1], match[2], match[3]].filter(Boolean).join("-");
  }

  function normalizeYear(value) {
    const match = String(value || "").match(/\d{4}/);
    return match ? match[0] : "";
  }

  function getBaseFilename(value) {
    const text = String(value || "");
    const parts = text.split(/[\\/]/);
    return parts[parts.length - 1] || text;
  }

  function isLikelyPdf(downloadItemOrUrl) {
    if (!downloadItemOrUrl) {
      return false;
    }

    if (typeof downloadItemOrUrl === "string") {
      const cleanUrl = downloadItemOrUrl.split(/[?#]/)[0];
      return /\.pdf$/i.test(cleanUrl) || /\/pdf(?:\/|\?|$)/i.test(cleanUrl);
    }

    const mime = String(downloadItemOrUrl.mime || "").toLowerCase();
    const url = String(downloadItemOrUrl.finalUrl || downloadItemOrUrl.url || "");
    const filename = String(downloadItemOrUrl.filename || "");
    return mime.includes("pdf") || isLikelyPdf(url) || /\.pdf$/i.test(filename);
  }

  function extractArxivId(value) {
    const text = String(value || "");
    const urlMatch = text.match(/arxiv\.org\/(?:abs|pdf)\/([^?#]+)/i);
    let candidate = urlMatch ? decodeURIComponent(urlMatch[1]) : "";

    if (!candidate) {
      const filenameMatch = text.match(/(?:^|[^0-9])(\d{4}\.\d{4,5})(v\d+)?(?:\.pdf)?(?:$|[^0-9])/i);
      candidate = filenameMatch ? `${filenameMatch[1]}${filenameMatch[2] || ""}` : "";
    }

    candidate = candidate.replace(/\.pdf$/i, "").replace(/v\d+$/i, "");
    if (/^\d{4}\.\d{4,5}$/.test(candidate) || /^[a-z-]+(?:\.[A-Z]{2})?\/\d{7}$/i.test(candidate)) {
      return candidate;
    }
    return "";
  }

  function extractOpenReviewId(value) {
    const text = String(value || "");
    try {
      const url = new URL(text);
      if (!/openreview\.net$/i.test(url.hostname)) {
        return "";
      }
      return url.searchParams.get("id") || "";
    } catch (error) {
      const match = text.match(/[?&]id=([^&#]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
      const filenameMatch = text.match(/(?:openreview|forum)[-_\s.]+(?:id[-_\s.=]+)?([A-Za-z0-9_-]{6,})/i);
      return filenameMatch ? filenameMatch[1] : "";
    }
  }

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  async function fetchText(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 8000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: "omit"
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 8000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: "omit"
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchArxivTitle(arxivId) {
    const metadata = await fetchArxivMetadata(arxivId);
    return metadata.title;
  }

  async function fetchArxivMetadata(arxivId) {
    if (!arxivId) {
      return normalizePaperMetadata({});
    }

    const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
    try {
      const xml = await fetchText(apiUrl, 8000);
      const metadata = extractArxivMetadataFromXml(xml);
      if (metadata.title) {
        return normalizePaperMetadata({
          ...metadata,
          source: "arxiv",
          sourceId: arxivId
        });
      }
    } catch (error) {
      // Fall through to the HTML page.
    }

    try {
      const html = await fetchText(`https://arxiv.org/abs/${encodeURIComponent(arxivId)}`, 8000);
      return normalizePaperMetadata({
        ...extractMetadataFromHtml(html),
        source: "arxiv",
        sourceId: arxivId
      });
    } catch (error) {
      return normalizePaperMetadata({ source: "arxiv", sourceId: arxivId });
    }
  }

  function extractArxivMetadataFromXml(xml) {
    const entryMatch = String(xml || "").match(/<entry\b[\s\S]*?<\/entry>/i);
    const entry = entryMatch ? entryMatch[0] : "";
    const authorMatches = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi)];
    return {
      title: normalizeTitle(readXmlTag(entry, "title")),
      authors: authorMatches.map((match) => decodeEntities(match[1])).map(normalizeWhitespace).filter(Boolean),
      date: normalizeDate(readXmlTag(entry, "published") || readXmlTag(entry, "updated"))
    };
  }

  function readXmlTag(xml, tagName) {
    const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\/${tagName}>`, "i");
    const match = String(xml || "").match(pattern);
    return match ? decodeEntities(match[1]) : "";
  }

  function readOpenReviewTitleFromNote(note) {
    const content = note && note.content;
    if (!content) {
      return "";
    }

    const title = content.title;
    if (typeof title === "string") {
      return normalizeTitle(title);
    }
    if (title && typeof title.value === "string") {
      return normalizeTitle(title.value);
    }
    return "";
  }

  async function fetchOpenReviewTitle(openReviewId) {
    const metadata = await fetchOpenReviewMetadata(openReviewId);
    return metadata.title;
  }

  async function fetchOpenReviewMetadata(openReviewId) {
    if (!openReviewId) {
      return normalizePaperMetadata({});
    }

    const urls = [
      `https://api2.openreview.net/notes?id=${encodeURIComponent(openReviewId)}`,
      `https://api.openreview.net/notes?id=${encodeURIComponent(openReviewId)}`
    ];

    for (const url of urls) {
      try {
        const json = await fetchJson(url, 8000);
        const notes = Array.isArray(json.notes) ? json.notes : [];
        for (const note of notes) {
          const metadata = readOpenReviewMetadataFromNote(note);
          if (metadata.title) {
            return normalizePaperMetadata({
              ...metadata,
              source: "openreview",
              sourceId: openReviewId
            });
          }
        }
      } catch (error) {
        // Try the next API endpoint.
      }
    }

    try {
      const html = await fetchText(`https://openreview.net/forum?id=${encodeURIComponent(openReviewId)}`, 8000);
      return normalizePaperMetadata({
        ...extractMetadataFromHtml(html),
        source: "openreview",
        sourceId: openReviewId
      });
    } catch (error) {
      return normalizePaperMetadata({ source: "openreview", sourceId: openReviewId });
    }
  }

  function readOpenReviewMetadataFromNote(note) {
    const content = note && note.content;
    const readValue = (value) => {
      if (Array.isArray(value)) {
        return value.map(readValue).filter(Boolean);
      }
      if (value && typeof value.value !== "undefined") {
        return readValue(value.value);
      }
      return typeof value === "string" ? value : "";
    };

    return {
      title: normalizeTitle(readValue(content && content.title)),
      authors: readValue(content && content.authors),
      date: normalizeDate(readValue(content && (content.date || content.publication_date || content.venueid)) || note.pdate || note.cdate)
    };
  }

  function extractTitleFromHtml(html) {
    return extractMetadataFromHtml(html).title;
  }

  function extractMetadataFromHtml(html) {
    const text = String(html || "");
    const selectors = [
      /<meta\b[^>]*(?:name|property)=["']citation_title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']citation_title["'][^>]*>/i,
      /<meta\b[^>]*(?:name|property)=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']og:title["'][^>]*>/i,
      /<h1\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
      /<h1\b[^>]*>([\s\S]*?)<\/h1>/i,
      /<title\b[^>]*>([\s\S]*?)<\/title>/i
    ];

    let title = "";
    for (const pattern of selectors) {
      const match = text.match(pattern);
      title = normalizeTitle(match && match[1]);
      if (title) {
        title = title.replace(/\s*\|\s*OpenReview\s*$/i, "").replace(/\s*-\s*arXiv.*$/i, "").trim();
        break;
      }
    }

    return normalizePaperMetadata({
      title,
      authors: readHtmlMetaValues(text, "citation_author"),
      date: readHtmlMeta(text, "citation_publication_date") || readHtmlMeta(text, "citation_date")
    });
  }

  function readHtmlMeta(html, name) {
    return readHtmlMetaValues(html, name)[0] || "";
  }

  function readHtmlMetaValues(html, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "gi"),
      new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "gi")
    ];
    const values = [];
    for (const pattern of patterns) {
      for (const match of String(html || "").matchAll(pattern)) {
        const value = normalizeWhitespace(decodeEntities(match[1]));
        if (value) {
          values.push(value);
        }
      }
    }
    return values;
  }

  globalThis.PaperRenamerUtils = {
    DEFAULT_SETTINGS,
    mergeSettings,
    normalizeWhitespace,
    normalizeTitle,
    sanitizeFilename,
    ensurePdfExtension,
    renderFilenameTemplate,
    normalizePaperMetadata,
    getBaseFilename,
    isLikelyPdf,
    extractArxivId,
    extractOpenReviewId,
    fetchArxivTitle,
    fetchArxivMetadata,
    fetchOpenReviewTitle,
    fetchOpenReviewMetadata,
    extractTitleFromHtml,
    extractMetadataFromHtml,
    withTimeout
  };
})();
