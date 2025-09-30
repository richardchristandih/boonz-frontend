// src/utils/driveUrl.js
export function driveShareToDirect(url = "") {
  if (!url) return "";
  // Already absolute http(s) or data URI -> keep as-is
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;

  return url; // return raw; caller may add domain if needed
}

/**
 * Makes sure any Google Drive link becomes a fully-qualified direct-view URL.
 * Accepts:
 *  - Full "file/d/FILEID/view?.." links
 *  - "open?id=FILEID" links
 *  - Already-converted "uc?export=view&id=FILEID" (with or WITHOUT domain)
 *  - Plain FILEID (we'll treat it as Drive file id)
 */
export function normalizeImageUrl(input = "") {
  let u = (input || "").trim();
  if (!u) return "";

  // Already fully-qualified http(s) URL?
  if (/^https?:\/\//i.test(u)) {
    // Convert if it's a share link
    const m1 = u.match(/[?&]id=([a-zA-Z0-9_-]+)/); // open?id=FILEID
    const m2 = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//); // /file/d/FILEID/
    if (m1) return `https://drive.google.com/uc?export=view&id=${m1[1]}`;
    if (m2) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;
    return u; // some other absolute URL; leave it
  }

  // Starts with "uc?export=..." (missing domain)
  if (u.startsWith("uc?")) {
    return `https://drive.google.com/${u}`;
  }

  // Looks like just a FILEID: build the uc link
  if (/^[a-zA-Z0-9_-]{20,}$/.test(u)) {
    return `https://drive.google.com/uc?export=view&id=${u}`;
  }

  // Otherwise, leave it as-is (could be a local relative path like "coffee/latte.jpg")
  return u;
}
