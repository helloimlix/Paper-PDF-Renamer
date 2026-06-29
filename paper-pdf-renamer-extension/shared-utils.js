(function () {
  const DEFAULT_SETTINGS = {
    enabled: true,
    confirmBeforeRename: true,
    allowNetwork: true,
    overwriteSameName: false,
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
    filename = filename.replace(/\s*-\s*/g, " - ");
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
    if (!arxivId) {
      return "";
    }

    const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
    try {
      const xml = await fetchText(apiUrl, 8000);
      const entryMatch = xml.match(/<entry\b[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/entry>/i);
      const title = normalizeTitle(entryMatch && entryMatch[1]);
      if (title) {
        return title;
      }
    } catch (error) {
      // Fall through to the HTML page.
    }

    try {
      const html = await fetchText(`https://arxiv.org/abs/${encodeURIComponent(arxivId)}`, 8000);
      return extractTitleFromHtml(html);
    } catch (error) {
      return "";
    }
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
    if (!openReviewId) {
      return "";
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
          const title = readOpenReviewTitleFromNote(note);
          if (title) {
            return title;
          }
        }
      } catch (error) {
        // Try the next API endpoint.
      }
    }

    try {
      const html = await fetchText(`https://openreview.net/forum?id=${encodeURIComponent(openReviewId)}`, 8000);
      return extractTitleFromHtml(html);
    } catch (error) {
      return "";
    }
  }

  function extractTitleFromHtml(html) {
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

    for (const pattern of selectors) {
      const match = text.match(pattern);
      const title = normalizeTitle(match && match[1]);
      if (title) {
        return title.replace(/\s*\|\s*OpenReview\s*$/i, "").replace(/\s*-\s*arXiv.*$/i, "").trim();
      }
    }
    return "";
  }

  globalThis.PaperRenamerUtils = {
    DEFAULT_SETTINGS,
    mergeSettings,
    normalizeWhitespace,
    normalizeTitle,
    sanitizeFilename,
    ensurePdfExtension,
    getBaseFilename,
    isLikelyPdf,
    extractArxivId,
    extractOpenReviewId,
    fetchArxivTitle,
    fetchOpenReviewTitle,
    extractTitleFromHtml,
    withTimeout
  };
})();
